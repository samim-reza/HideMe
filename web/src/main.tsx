import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// The browser only allows encryption (WebCrypto) on secure https:// pages,
// so send anyone who arrives on plain http:// to the https:// address.
const { protocol, hostname, host, pathname, search, hash } = window.location
if (protocol === 'http:' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
  window.location.replace(`https://${host}${pathname}${search}${hash}`)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
