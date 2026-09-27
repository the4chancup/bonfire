// SPDX-License-Identifier: AGPL-3.0-or-later

// Firefox places the caret inside a `contenteditable="false"` decorator subtree
// after `Selection.modify('lineboundary')` when a decorator starts the line;
// Lexical cannot resolve that point and drops the selection. Move the endpoint
// to just outside the outermost non-editable ancestor below the editor root.
export function pointOutsideNonEditable(node: Node, offset: number, root: Node, forward: boolean): [Node, number] {
	let outermost: Element | null = null;
	let current: Node | null = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
	while (current !== null && current !== root) {
		if (current.nodeType === Node.ELEMENT_NODE && (current as Element).getAttribute('contenteditable') === 'false') {
			outermost = current as Element;
		}
		current = current.parentNode;
	}
	if (outermost === null || outermost.parentNode === null) {
		return [node, offset];
	}
	const index = Array.prototype.indexOf.call(outermost.parentNode.childNodes, outermost);
	return [outermost.parentNode, forward ? index + 1 : index];
}
