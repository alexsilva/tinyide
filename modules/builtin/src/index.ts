import type { TinyIdeModule } from "@tinyide/plugin-api";
import { htmlModule } from "@tinyide/module-html";
import { codeFormatterModule } from "@tinyide/module-code-formatter";
import { textCompletionModule } from "@tinyide/module-text-completion";
import { themeModule } from "@tinyide/module-themes";
import { fontModule } from "@tinyide/module-fonts";
import { iconModule } from "@tinyide/module-icons";

/** Catálogo das implementações básicas carregadas automaticamente pela IDE. */
export const builtinModules: readonly TinyIdeModule[] = [
  themeModule,
  fontModule,
  iconModule,
  htmlModule,
  textCompletionModule,
  codeFormatterModule,
];
