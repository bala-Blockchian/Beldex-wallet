import { useEffect, useRef, useState } from 'react'

//done
interface CopyButtonProps {
  value: string
  label?: string
  className?: string
  disabled?: boolean
}

export default function CopyButton({
  value,
  label = 'Copy',
  className = '',
  disabled = false
  
}: CopyButtonProps) {

  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      className={`copy-button ${className}`.trim()}
      onClick={handleCopy}
      disabled={disabled}
    >
      {/* generic copy button */}
      {copied ? 'Copied' : label} 
    </button>
  )
}
