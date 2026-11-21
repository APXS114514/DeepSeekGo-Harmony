import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getNode, hvigor } from '@ohos/hvigor';
import { hapTasks, OhosPluginId, type OhosHapContext } from '@ohos/hvigor-ohos-plugin';

hvigor.nodesEvaluated(() => {
  const node = getNode(__filename)!;
  const context: OhosHapContext = node.getContext(OhosPluginId.OHOS_HAP_PLUGIN);
  context.targets((target) => {
    const name = target.getTargetName();
    node.registerTask({
      name: `${name}@PreserveLauncherIconSize`,
      dependencies: [`${name}@ProcessResource`],
      postDependencies: [`${name}@CompileResource`],
      run() {
        // SDK 26.0.0 会在存在 compression 配置时把两层图标降到 512px，
        // 即使纹理压缩已关闭。本项目不使用纹理压缩，移除该编译参数以保留原始尺寸。
        const configPath = join(target.getModulePathDetails().getIntermediatesRes(), 'resConfig.json');
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        if ('compression' in config) {
          delete config.compression;
          writeFileSync(configPath, JSON.stringify(config));
        }
      }
    });
  });
});

export default {
  system: hapTasks,
  plugins: []
};
