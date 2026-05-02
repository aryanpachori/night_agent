import { Variants } from 'framer-motion'

export const ease = {
  smooth: [0.25, 0.1, 0.25, 1.0] as const,
  out:    [0.0,  0.0, 0.2,  1.0] as const,
  inOut:  [0.4,  0.0, 0.2,  1.0] as const,
  spring: [0.34, 1.56, 0.64, 1]  as const,
}

export const duration = {
  instant:  0.08,
  fast:     0.15,
  normal:   0.25,
  slow:     0.4,
  verySlow: 0.6,
}

export const fadeUp: Variants = {
  hidden:  { opacity: 0, y: 16, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0,  filter: 'blur(0px)',
    transition: { duration: 0.4, ease: [0.0, 0.0, 0.2, 1] } },
  exit:    { opacity: 0, y: -8,
    transition: { duration: 0.15, ease: [0.25, 0.1, 0.25, 1] } },
}

export const fadeIn: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
}

export const scaleIn: Variants = {
  hidden:  { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1,
    transition: { duration: 0.25, ease: [0.0, 0.0, 0.2, 1] } },
  exit:    { opacity: 0, scale: 0.97,
    transition: { duration: 0.15 } },
}

export const staggerContainer: Variants = {
  hidden:  { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
}

export const staggerItem: Variants = {
  hidden:  { opacity: 0, y: 12, filter: 'blur(3px)' },
  visible: { opacity: 1, y: 0,  filter: 'blur(0px)',
    transition: { duration: 0.4, ease: [0.0, 0.0, 0.2, 1] } },
}

export const tableRow: Variants = {
  hidden:  { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0,
    transition: { duration: 0.25, ease: [0.0, 0.0, 0.2, 1] } },
}
