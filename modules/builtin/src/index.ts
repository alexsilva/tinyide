import type { TinyIdeModule } from "@tinyide/plugin-api";
import { htmlModule } from "@tinyide/module-html";
import { themeModule } from "@tinyide/module-themes";
import { fontModule } from "@tinyide/module-fonts";

/** Catálogo das implementações básicas carregadas automaticamente pela IDE. */
export const builtinModules: readonly TinyIdeModule[] = [themeModule, fontModule, htmlModule];
