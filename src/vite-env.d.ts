/// <reference types="vite/client" />

// Worker pdf.js diimpor sebagai URL asset oleh Vite (suffix ?url)
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' {
  const url: string
  export default url
}

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export * from 'pdfjs-dist'
}
