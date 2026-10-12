import { ClerkProvider } from '@clerk/react'
import { LazyMotion } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* `strict` + `m` (see Reveal.jsx) keeps the animation layer to the
        domAnimation feature set, and the dynamic import keeps those bytes out
        of the bundle everyone downloads to reach the app. */}
    <LazyMotion features={() => import('./lib/motionFeatures.js').then((m) => m.default)} strict>
      <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
        <App />
      </ClerkProvider>
    </LazyMotion>
  </StrictMode>,
)
