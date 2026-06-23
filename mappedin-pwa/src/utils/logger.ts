export function appLog(tag: string, message: string, detail?: unknown): void {
  if (!import.meta.env.DEV) return;
  if (detail !== undefined) {
    console.log(`[IndoorNav/${tag}] ${message}`, detail);
  } else {
    console.log(`[IndoorNav/${tag}] ${message}`);
  }
}

export function appWarn(tag: string, message: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.warn(`[IndoorNav/${tag}] ${message}`, detail);
  } else {
    console.warn(`[IndoorNav/${tag}] ${message}`);
  }
}
