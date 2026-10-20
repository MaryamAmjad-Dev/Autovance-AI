import { Html, Head, Main, NextScript } from 'next/document'

// Applies the saved theme before first paint (no flicker) and defaults to
// light for first-time visitors. Runs before React hydration, so React always
// renders the default markup — no hydration mismatches. The OS preference is
// intentionally never consulted: only the user's explicit choice counts.
const themeBootScript = `(function(){try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`

export default function Document() {
  return (
    <Html lang="en" data-theme="light">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
