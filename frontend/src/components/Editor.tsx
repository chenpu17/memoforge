import React from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'

interface EditorProps {
  value: string
  onChange: (value: string) => void
}

export const Editor: React.FC<EditorProps> = ({ value, onChange }) => {
  return (
    <div className="h-full w-full">
      <CodeMirror
        value={value}
        height="100%"
        extensions={[markdown()]}
        onChange={onChange}
        className="text-sm"
      />
    </div>
  )
}
