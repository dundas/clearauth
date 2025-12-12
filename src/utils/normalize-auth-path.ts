export function normalizeAuthPath(pathname: string): string {
  let path = pathname.replace(/\/$/, '')
  if (path.startsWith('/api/auth')) {
    path = path.replace(/^\/api/, '')
  }
  return path
}
