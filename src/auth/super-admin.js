// DP Assistant — Super-administrateur (accès /api/users/*).
// Miroir de Auth::SUPER_ADMIN_EMAIL côté backend : le rôle DB `admin` ne suffit pas.

export const SUPER_ADMIN_EMAIL = 'nicholas.jallan@gmail.com';

/** @param {{email?: string}|null|undefined} user */
export const isSuperAdmin = (user) => !!user && user.email === SUPER_ADMIN_EMAIL;
