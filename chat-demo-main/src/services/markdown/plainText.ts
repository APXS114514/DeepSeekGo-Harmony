import type { Nodes } from 'mdast'
import { toMdAst } from './parse.js'

const plainNode = (node: Nodes): string => {
  switch (node.type) {
    case 'break':
      return '\n'
    case 'image':
      return node.alt ?? ''
    case 'definition':
    case 'html':
      return ''
    case 'citation':
      return ''
    case 'list':
      return node.children
        .map(
          (item, index) =>
            `${node.ordered ? `${(node.start ?? 1) + index}.` : '•'} ${plainNode(item)}`
        )
        .join('\n')
    default:
      if ('value' in node) {
        return node.value
      }
      if ('children' in node) {
        const separator =
          node.type === 'root' || node.type === 'blockquote'
            ? '\n\n'
            : node.type === 'table' || node.type === 'listItem'
              ? '\n'
              : node.type === 'tableRow'
                ? ' | '
                : ''
        return node.children.map(plainNode).join(separator)
      }
      return ''
  }
}

export const plainAnswer = (markdown: string) =>
  plainNode(toMdAst(markdown, { sources: [], disableLink: true })).trim() || markdown
