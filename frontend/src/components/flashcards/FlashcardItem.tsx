'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'

interface FlashcardItemProps {
  front: string
  back: string
  width?: string
  height?: string
}

export default function FlashcardItem({
  front,
  back,
  width = 'w-full',
  height = 'h-64'
}: FlashcardItemProps) {
  const [isFlipped, setIsFlipped] = useState(false)

  const handleFlip = () => {
    setIsFlipped(!isFlipped)
  }

  return (
    <div 
      className={`relative ${width} ${height} perspective-1000 cursor-pointer`}
      onClick={handleFlip}
    >
      <motion.div
        className="w-full h-full relative preserve-3d transition-all duration-500"
        animate={{ rotateY: isFlipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Front Face */}
        <div 
          className="absolute w-full h-full backface-hidden bg-white/10 border border-white/20 rounded-2xl p-6 flex flex-col justify-center items-center shadow-xl backdrop-blur-md"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <div className="absolute top-4 left-4 text-white/40 text-xs font-semibold uppercase tracking-wider">
            Question
          </div>
          <h3 className="text-xl md:text-2xl font-medium text-white text-center leading-relaxed">
            {front}
          </h3>
          <div className="absolute bottom-4 right-4 text-white/20 text-xs">
            Click to flip ↺
          </div>
        </div>

        {/* Back Face */}
        <div 
          className="absolute w-full h-full backface-hidden bg-indigo-600/20 border border-indigo-400/30 rounded-2xl p-6 flex flex-col justify-center items-center shadow-xl backdrop-blur-md overflow-y-auto"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="absolute top-4 left-4 text-indigo-300/60 text-xs font-semibold uppercase tracking-wider">
            Answer
          </div>
          <p className="text-lg md:text-xl text-indigo-50 text-center leading-relaxed whitespace-pre-wrap">
            {back}
          </p>
        </div>
      </motion.div>
    </div>
  )
}
