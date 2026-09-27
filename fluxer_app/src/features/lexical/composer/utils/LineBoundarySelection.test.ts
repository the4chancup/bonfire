// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

import {describe, expect, it} from 'vitest';
import {pointOutsideNonEditable} from './LineBoundarySelection';

// <div contenteditable><p><span>X</span><span ce=false><span><span ce=false><span>@f4r</span></span></span></span><span> hello</span></p></div>
function buildFixture() {
	const root = document.createElement('div');
	root.setAttribute('contenteditable', 'true');
	const p = document.createElement('p');
	const leading = document.createElement('span');
	leading.textContent = 'X';
	const outerPill = document.createElement('span');
	outerPill.setAttribute('contenteditable', 'false');
	const mid = document.createElement('span');
	const innerPill = document.createElement('span');
	innerPill.setAttribute('contenteditable', 'false');
	const innerText = document.createElement('span');
	innerText.textContent = '@f4r';
	innerPill.appendChild(innerText);
	mid.appendChild(innerPill);
	outerPill.appendChild(mid);
	const trailing = document.createElement('span');
	trailing.textContent = ' hello';
	p.appendChild(leading);
	p.appendChild(outerPill);
	p.appendChild(trailing);
	root.appendChild(p);
	document.body.appendChild(root);
	return {root, p, outerPill, innerPill, mentionText: innerText.firstChild!, trailingText: trailing.firstChild!};
}

describe('pointOutsideNonEditable', () => {
	it('moves a point inside a pill to before the outermost host when going backward', () => {
		const {root, p, mentionText} = buildFixture();
		expect(pointOutsideNonEditable(mentionText, 0, root, false)).toEqual([p, 1]);
	});
	it('moves a point inside a pill to after the outermost host when going forward', () => {
		const {root, p, mentionText} = buildFixture();
		expect(pointOutsideNonEditable(mentionText, 0, root, true)).toEqual([p, 2]);
	});
	it('leaves a point inside editable text unchanged', () => {
		const {root, trailingText} = buildFixture();
		expect(pointOutsideNonEditable(trailingText, 3, root, true)).toEqual([trailingText, 3]);
		expect(pointOutsideNonEditable(trailingText, 3, root, false)).toEqual([trailingText, 3]);
	});
	it('chooses the outermost contenteditable=false host, not the inner one', () => {
		const {root, p, outerPill, innerPill, mentionText} = buildFixture();
		const [node, offset] = pointOutsideNonEditable(mentionText, 0, root, false);
		expect(node).toBe(p);
		expect(Array.prototype.indexOf.call(node.childNodes, outerPill)).toBe(offset);
		expect(node).not.toBe(innerPill.parentNode);
	});
});
