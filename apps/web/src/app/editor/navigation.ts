import type {
  TextEditorNavigationContext,
  TextEditorNavigationProvider,
  TextEditorNavigationTarget,
} from "@tinyide/plugin-api";

export async function resolveTextEditorNavigation(
  providers: readonly TextEditorNavigationProvider[],
  context: TextEditorNavigationContext,
): Promise<TextEditorNavigationTarget | undefined> {
  const candidates = providers
    .filter((provider) => provider.canNavigate(context.document))
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  for (const provider of candidates) {
    const [target] = await provider.provideTargets(context);
    if (target) return target;
  }
  return undefined;
}
