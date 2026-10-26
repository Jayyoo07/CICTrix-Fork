/** The sign-in page for the portal a path belongs to, for "session expired" failures. */
export const loginPathFor = (pathname: string): string => {
  if (pathname.startsWith('/interviewer')) return '/interviewer/login';
  if (pathname.startsWith('/employee') || pathname.startsWith('/office')) return '/employee/login';
  if (pathname.startsWith('/admin') || pathname.startsWith('/super-admin')) return '/admin/login';
  return '/';
};

/** Full reload to the sign-in page, so no stale session state survives. */
export const goToLogin = (): void => {
  if (typeof window === 'undefined') return;
  window.location.assign(loginPathFor(window.location.pathname));
};
