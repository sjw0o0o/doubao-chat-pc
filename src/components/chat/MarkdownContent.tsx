import { XMarkdown } from '@ant-design/x-markdown'

type MarkdownContentProps = {
  content: string
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="markdown-content">
      <XMarkdown content={content} />
    </div>
  )
}
