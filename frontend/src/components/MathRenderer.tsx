'use client'

/**
 * MathRenderer — Renders markdown with LaTeX math using:
 *   react-markdown + remark-math + rehype-katex
 * Used in: chat responses, flashcard back_text
 */

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

// KaTeX CSS must be loaded globally — add to layout.tsx or globals.css:
// import 'katex/dist/katex.min.css'

interface MathRendererProps {
  content: string
  className?: string
}

export default function MathRenderer({ content, className = '' }: MathRendererProps) {
  return (
    <div className={`prose prose-invert max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Inline code styling
          code({ children, className, ...props }) {
            const isInline = !className
            return isInline ? (
              <code
                className="bg-white/10 text-emerald-300 px-1.5 py-0.5 rounded text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            ) : (
              <code className={`${className} text-sm`} {...props}>
                {children}
              </code>
            )
          },
          // Paragraph spacing
          p({ children }) {
            return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
