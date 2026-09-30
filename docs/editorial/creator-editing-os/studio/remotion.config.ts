/**
 * Remotion config — webpack overrides, path aliases, and public directory.
 * @see https://www.remotion.dev/docs/config
 */
import { Config } from "@remotion/cli/config";
import path from "path";

Config.setPublicDir("public");

Config.overrideWebpackConfig((currentConfig) => {
  return {
    ...currentConfig,
    resolve: {
      ...currentConfig.resolve,
      alias: {
        ...(currentConfig.resolve?.alias as Record<string, string> | undefined),
        "@design":     path.join(process.cwd(), "src", "design"),
        "@components": path.join(process.cwd(), "src", "components"),
      },
    },
  };
});
