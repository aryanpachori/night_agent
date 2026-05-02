'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { fadeUp } from '@/lib/animations'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="flex flex-col flex-1"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
