import { createRoot } from 'react-dom/client'
import { App } from './app/App.js'
import { setupTheme } from './app/theme.js'
import { ensureKatex } from './services/markdown/katex.js'
import { routeDeviceLinks } from './services/harmony.js'
import './app/theme.css'
import './app/global.css'
import './app/harmony.css'

if (__HARMONY_APP__) {
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute('content', 'width=device-width,initial-scale=1,viewport-fit=cover')
  document.body.classList.add('harmony-app')
  document.title = 'DeepSeek 随身'
  routeDeviceLinks()
}
ensureKatex()
setupTheme()

createRoot(document.getElementById('root') as HTMLElement).render(<App />)
