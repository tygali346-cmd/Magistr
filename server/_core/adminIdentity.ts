export function isConfiguredAdmin(
  openId: string,
  email: string | null | undefined,
  config: { ownerOpenId?: string; adminEmail?: string },
): boolean {
  if (config.ownerOpenId && openId === config.ownerOpenId) return true;
  const configuredEmail = config.adminEmail?.trim().toLocaleLowerCase("en-US");
  const accountEmail = email?.trim().toLocaleLowerCase("en-US");
  return Boolean(configuredEmail && accountEmail && configuredEmail === accountEmail);
}

type AdminPrincipal = {
  openId: string;
  email?: string | null;
  role?: string | null;
};

export function isAuthorizedAdmin(
  user: AdminPrincipal | null | undefined,
  config: { ownerOpenId?: string; adminEmail?: string },
): boolean {
  return Boolean(
    user?.role === "admin" && isConfiguredAdmin(user.openId, user.email, config),
  );
}
