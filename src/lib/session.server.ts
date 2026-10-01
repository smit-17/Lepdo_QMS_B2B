// Password protection has been removed: the app is open to everyone.
export async function isAuthenticated(): Promise<boolean> {
  return true;
}

export async function requireAuth(): Promise<void> {
  // no-op
}
