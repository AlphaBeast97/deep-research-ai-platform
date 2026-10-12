/**
 * The `motion` feature set, exported so `LazyMotion` can load it lazily
 * (see main.jsx). Keeping it in its own module is what puts it in a separate
 * chunk instead of the bundle everyone downloads to reach the app.
 */
export { domAnimation as default } from 'motion/react'
