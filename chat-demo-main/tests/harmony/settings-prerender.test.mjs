import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { chromium, launchOptions, repoRoot } from './support.mjs'

const origin = 'https://deepseek.local.invalid'
const assets = join(repoRoot, 'harmony/entry/src/main/resources/rawfile/chat')
const native = await readFile(join(repoRoot, 'harmony/entry/src/main/ets/pages/Index.ets'), 'utf8')
const csp = native
  .match(/const PAGE_POLICY = ([\s\S]*?);\n/)[1]
  .match(/"([^"]*)"/g)
  .map((part) => JSON.parse(part))
  .join('')
const media = {
  '.png': 'image/png',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

const browser = await chromium.launch({ ...launchOptions, args: ['--no-sandbox'] })
try {
  const createPage = async ({ width = 1024, height = 760, mobile = false, dark = false } = {}) => {
    const context = await browser.newContext({
      locale: 'zh-CN',
      viewport: { width, height },
      isMobile: mobile,
      hasTouch: mobile,
      colorScheme: dark ? 'dark' : 'light',
    })
    let balanceRequests = 0
    await context.addInitScript((isMobile) => {
      sessionStorage.setItem('mockDeviceKey', 'test-prerender-key')
      localStorage.setItem(
        'chat-demo:memory',
        JSON.stringify({
          enabled: true,
          auto: false,
          items: [
            { id: 'm1', text: '使用 HarmonyOS 设备', createdAt: 1, updatedAt: 1 },
            { id: 'm2', text: '偏好简洁回复', createdAt: 2, updatedAt: 2 },
          ],
        })
      )
      localStorage.setItem(
        'chat-demo:persona-cards',
        JSON.stringify({
          enabled: true,
          activeId: 'p1',
          items: [{ id: 'p1', name: '技术助手', prompt: '直接给出关键步骤。' }],
        })
      )
      window.addEventListener(
        'load',
        () => {
          const { port1, port2 } = new MessageChannel()
          const post = (message) => port1.postMessage(JSON.stringify(message))
          window.devicePost = post
          port1.onmessage = (event) => {
            const { id, operation } = JSON.parse(event.data)
            if (operation === 'window-ui') {
              post({
                type: 'window-layout',
                insets: { top: 0, right: 0, bottom: 0, left: 0 },
                nativeHeader: false,
              })
              return
            }
            if (operation === 'read') {
              post({ id, status: 0, value: sessionStorage.getItem('mockDeviceKey') || '' })
            }
          }
          window.postMessage('pocket-chat-device-port', window.location.origin, [port2])
          post({
            type: 'device-features',
            voice: true,
            apiVoice: false,
            readAloud: false,
            share: false,
            scan: true,
            immersiveScanMenu: false,
            immersiveUi: false,
            save: true,
            location: true,
            haptics: false,
            windowPrivacy: false,
            deviceType: isMobile ? 'phone' : 'tablet',
          })
        },
        { once: true }
      )
    }, mobile)

    await context.route(origin + '/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({
        body: await readFile(assets + path),
        contentType: media[extname(path)],
        headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' },
      })
    })
    await context.route('https://api.deepseek.com/**', async (route) => {
      const url = new URL(route.request().url())
      const headers = {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': '*',
      }
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers })
      }
      if (url.pathname === '/user/balance') {
        balanceRequests += 1
        return route.fulfill({
          headers,
          json: {
            is_available: true,
            balance_infos: [
              {
                currency: 'CNY',
                total_balance: '12.34',
                granted_balance: '2.34',
                topped_up_balance: '10.00',
              },
            ],
          },
        })
      }
      return route.fulfill({ headers, json: { data: [{ id: 'deepseek-flash' }] } })
    })

    const page = await context.newPage()
    page.setDefaultTimeout(7000)
    const runtimeErrors = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    await page.goto(origin + '/index.html')
    await page.getByPlaceholder('请输入消息').waitFor()
    return {
      context,
      page,
      runtimeErrors,
      getBalanceRequests: () => balanceRequests,
    }
  }

  // 1. 桌面宽屏：打开只渲染当前页签 -> 空闲分批预渲染其余页签 -> 余额按选中刷新 -> 切换首帧高亮与 DOM 复用
  {
    const { context, page, runtimeErrors, getBalanceRequests } = await createPage()

    // 记录设置弹窗打开后每一批挂载的 tabpanel
    await page.evaluate(() => {
      window.mountBatches = []
      const observer = new MutationObserver((records) => {
        const added = []
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof HTMLElement)) continue
            if (node.matches('[data-settings-section]')) {
              added.push(node.getAttribute('data-settings-section'))
            }
            for (const child of node.querySelectorAll('[data-settings-section]')) {
              added.push(child.getAttribute('data-settings-section'))
            }
          }
        }
        if (added.length > 0) {
          window.mountBatches.push([...new Set(added)])
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
      window.__stopMountObserver = () => observer.disconnect()
    })

    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置', exact: true })
    await dialog.waitFor()

    // 等待空闲预渲染把全部 4 个页签挂载并进入 content-visibility: hidden 缓存态
    await page.waitForFunction(() => {
      const panels = [...document.querySelectorAll('[data-settings-section]')]
      if (panels.length !== 4) return false
      return panels
        .filter((panel) => panel.getAttribute('data-settings-section') !== 'general')
        .every(
          (panel) =>
            panel.inert === true &&
            panel.getAttribute('aria-hidden') === 'true' &&
            getComputedStyle(panel).contentVisibility === 'hidden'
        )
    })

    const batches = await page.evaluate(() => {
      window.__stopMountObserver()
      return window.mountBatches
    })
    assert.deepEqual(batches[0], ['general'], 'opening settings must only mount the initial tab')
    assert(
      batches.slice(1).every((batch) => batch.length === 1),
      `idle pre-render must mount one tab per slice, got ${JSON.stringify(batches)}`
    )
    assert.deepEqual(batches.flat().sort(), ['data', 'general', 'personal', 'privacy'])

    // 每个页签有独立 id / aria-controls / aria-labelledby；二级页未点开时不预先挂载
    const structure = await dialog.evaluate((root) => {
      const tabs = [...root.querySelectorAll('[role="tab"]')]
      const controls = tabs.map((tab) => tab.getAttribute('aria-controls'))
      const panels = controls.map((id) => document.getElementById(id))
      return {
        uniqueControls: new Set(controls).size === tabs.length,
        allMatched: tabs.every(
          (tab, i) => panels[i] && panels[i].getAttribute('aria-labelledby') === tab.id
        ),
        hasSubpageControls: Boolean(
          root.querySelector('[aria-label="沉浸光感"], [aria-label="主动生成图表"]')
        ),
      }
    })
    assert.equal(structure.uniqueControls, true, 'each tab must control its own tabpanel id')
    assert.equal(structure.allMatched, true, 'each tabpanel must be labelled by its tab')
    assert.equal(
      structure.hasSubpageControls,
      false,
      'general subpages must remain rendered on demand'
    )

    // 预渲染「数据管理」后不应提前请求余额
    assert.equal(
      getBalanceRequests(),
      0,
      'ApiBalance must not request balance while data tab is hidden'
    )

    // 记录 4 个面板的 DOM 引用，并监听首帧页签高亮切换
    const tablist = dialog.getByRole('tablist')
    await tablist.evaluate((list) => {
      window.__panelNodes = Object.fromEntries(
        [...document.querySelectorAll('[data-settings-section]')].map((el) => [
          el.getAttribute('data-settings-section'),
          el,
        ])
      )
      const tabs = [...list.querySelectorAll('[role=tab]')]
      const selected = tabs.find((tab) => tab.ariaSelected === 'true')
      const selectedColor = getComputedStyle(selected).backgroundColor
      window.tabSwitches = []
      new MutationObserver(() => {
        const active = tabs.filter((tab) => tab.ariaSelected === 'true')
        const [current] = active
        const panel = document.getElementById(current?.getAttribute('aria-controls'))
        window.tabSwitches.push({
          names: active.map((tab) => tab.textContent.trim()),
          panelMatches: panel && panel.getAttribute('aria-labelledby') === current.id,
          panelInert: panel?.inert,
          panelContentVisibility: panel ? getComputedStyle(panel).contentVisibility : '',
          selectedColor,
          currentColor: current && getComputedStyle(current).backgroundColor,
          inactiveColors: tabs
            .filter((tab) => tab !== current)
            .map((tab) => getComputedStyle(tab).backgroundColor),
        })
      }).observe(list, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] })
    })

    // 切到「数据管理」：首次请求余额
    await tablist.getByRole('tab', { name: '数据管理', exact: true }).click()
    await dialog.getByText('12.34').waitFor()
    assert.equal(getBalanceRequests(), 1, 'entering data tab must fetch balance once')

    // 切到「个性化」：验证预渲染内容、向下滚动后切走再切回会回到顶部
    await tablist.getByRole('tab', { name: '个性化', exact: true }).click()
    await dialog.getByText('技术助手').waitFor()
    await dialog.getByText('使用 HarmonyOS 设备').waitFor()
    const scrolled = await dialog.getByRole('tabpanel').evaluate((node) => {
      node.scrollTop = 120
      return node.scrollTop
    })
    assert(scrolled > 0, 'personalization tab should be scrollable')

    // 切到「隐私」后再切回「个性化」应回到顶部；期间不应请求余额
    await tablist.getByRole('tab', { name: '隐私', exact: true }).click()
    await dialog.getByRole('switch', { name: '防截屏和录屏' }).waitFor()
    assert.equal(getBalanceRequests(), 1, 'switching away from data tab must not fetch balance')
    await tablist.getByRole('tab', { name: '个性化', exact: true }).click()
    assert.equal(
      await dialog.getByRole('tabpanel').evaluate((node) => node.scrollTop),
      0,
      'switching back to a tab must reset scrollTop to 0'
    )

    await tablist.getByRole('tab', { name: '数据管理', exact: true }).click()
    await page.waitForFunction(
      () => document.querySelector('[data-settings-section="data"]') !== null
    )
    // 等待第二次余额请求完成
    await page.waitForTimeout(100)
    assert.equal(getBalanceRequests(), 2, 're-entering data tab must refresh balance again')

    // 切回「通用设置」
    await tablist.getByRole('tab', { name: '通用设置', exact: true }).click()

    // 核对首帧高亮、面板复用（DOM 节点未被销毁重建）与耗时打点
    const check = await page.evaluate(() => {
      const sameNodes = Object.entries(window.__panelNodes).every(
        ([key, node]) => document.querySelector(`[data-settings-section="${key}"]`) === node
      )
      return {
        sameNodes,
        switches: window.tabSwitches,
        measures: performance.getEntriesByName('settings-tab-switch').length,
      }
    })
    assert.equal(check.sameNodes, true, 'switching tabs must reuse pre-rendered tabpanel DOM nodes')
    assert(check.measures >= 5, `expected tab switch performance measures, got ${check.measures}`)
    for (const sw of check.switches) {
      assert.equal(sw.names.length, 1)
      assert.equal(sw.panelMatches, true)
      assert.equal(sw.panelInert, false)
      assert.equal(sw.panelContentVisibility, 'visible')
      assert.equal(
        sw.currentColor,
        sw.selectedColor,
        'active tab highlight must update immediately'
      )
      assert.deepEqual(
        sw.inactiveColors,
        Array(3).fill('rgba(0, 0, 0, 0)'),
        'inactive tabs must clear highlight immediately'
      )
    }

    // 关闭重开设置后，不等空闲预渲染立即点击「隐私」，应立即可用且后续仍完成其余页签预渲染
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await dialog.waitFor()
    await dialog.getByRole('tab', { name: '隐私', exact: true }).click()
    await dialog.getByRole('switch', { name: '位置信息' }).waitFor()
    await page.waitForFunction(
      () => document.querySelectorAll('[data-settings-section]').length === 4
    )
    assert.equal(getBalanceRequests(), 2, 'reopening and pre-rendering must not fetch balance')

    assert.deepEqual(runtimeErrors, [])
    await context.close()
  }

  // 2. 窄屏（360px）深色模式：预渲染与切换无横向溢出
  {
    const { context, page, runtimeErrors } = await createPage({
      width: 360,
      height: 640,
      mobile: true,
      dark: true,
    })
    await page.evaluate(() => window.devicePost({ type: 'window-action', action: 'sidebar' }))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置', exact: true })
    await dialog.waitFor()
    await page.waitForFunction(
      () => document.querySelectorAll('[data-settings-section]').length === 4
    )
    for (const tabName of ['个性化', '数据管理', '隐私', '通用设置']) {
      await dialog.getByRole('tab', { name: tabName, exact: true }).tap()
      const overflow = await dialog
        .getByRole('tabpanel')
        .evaluate((node) => node.scrollWidth - node.clientWidth)
      assert(overflow <= 1, `${tabName} overflowed horizontally on 360px: ${overflow}px`)
    }
    assert.deepEqual(runtimeErrors, [])
    await context.close()
  }

  console.log('settings-prerender: PASS')
} finally {
  await browser.close()
}
