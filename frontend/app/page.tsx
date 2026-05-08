import type { Metadata } from 'next'
import { LandingView } from '@/components/landing/landing-view'

export const metadata: Metadata = {
  title: {
    absolute: 'NightAgent — AI Quant Layer for Jupiter Prediction Markets',
  },
  description:
    'Scan 3,400+ markets, find mispriced paper bets with AI, and get Telegram alerts the moment real edge appears.',
}

export default function HomePage() {
  return <LandingView />
}
