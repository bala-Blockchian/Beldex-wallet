declare module '@bdxi/beldex-app-bridge' {
  interface BridgeLoaderOptions {
    [key: string]: unknown
  }

  const loadBridge: (options: BridgeLoaderOptions) => Promise<unknown>
  export default loadBridge
}
