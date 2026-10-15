/**
 * The scripts come in as text: `?raw` is read by the bundler of the
 * application that imports this package - Vite, in the frontend.
 */
declare module '*?raw' {
  const source: string

  export default source
}
