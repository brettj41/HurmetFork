import { schema } from "./schema"
import { openMathPrompt } from "./mathprompt"
import { EditorState } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { toggleMark } from "prosemirror-commands"
import { keymap } from "prosemirror-keymap"
import { undo, redo } from "prosemirror-history"
import { StepMap } from "prosemirror-transform"
import hurmet from "./hurmet"

export class CalcView {
  constructor(node, view) {
    this.node = node
    this.outerView = view
    this.dom = schema.nodes.calculation.spec.toDOM(node)
  }

  selectNode() {
    if (this.dom.children.length > 1) { return }
    this.dom.classList.add("ProseMirror-selectednode")
    const attrs = this.node.attrs
    const pos = this.outerView.state.selection.from
    // A CalcView node is a ProseMirror atom. It does not enable direct ProseMirror editing.
    // Instead we temporarily open a text editor instance in the node location.
    // Then, we update all dependent calculations only if the node is submitted.
    openMathPrompt({
      encoding: "HurmetMath",
      attrs: attrs,
      outerView: this.outerView,
      dom: this.dom,
      pos: pos,
      callback(attrs) {
        hurmet.updateCalculations(this.outerView, false, attrs, pos)
      },
      callback2(defPos) {
        // Scroll to a variable definition.
        const definitionTop = this.outerView.coordsAtPos(defPos).top
        const boundingTop = this.outerView.dom.getBoundingClientRect().top
        window.scrollTo(0, definitionTop - boundingTop)
      }
    })
  }

  deselectNode() {
    this.dom.classList.remove("ProseMirror-selectednode")
  }
  stopEvent() { return true }
}

export class TexView {
  constructor(node, view) {
    this.node = node
    this.outerView = view
    this.dom = schema.nodes.tex.spec.toDOM(node)
  }

  selectNode() {
    this.dom.classList.add("ProseMirror-selectednode")
    const attrs = this.node.attrs
    openMathPrompt({
      // Create a user interface for TeX that is similar to CalcView.
      // The need for a text editor instance is not as great here as it is in CalcView,
      // but I want the look and feel to be similar for both.
      encoding: "TeX",
      attrs: attrs,
      outerView: this.outerView,
      dom: this.dom,
      callback(attrs) {
        const oView = this.outerView
        oView.dispatch(
          oView.state.tr.replaceSelectionWith(schema.nodes.tex.createAndFill(attrs))
        )
        oView.focus()
      }
    })
  }

  deselectNode() {
    this.dom.classList.remove("ProseMirror-selectednode")
  }
  stopEvent() { return true }
}

export class EmbedView {
  constructor(node, view) {
    this.node = node
    this.outerView = view
    this.dom = document.createElement("div")
    this.dom.className = "embed"
    this.dom.setAttribute("data-embed", "true")
    this.dom.contentEditable = "false"
    this.iframe = document.createElement("iframe")
    this.iframe.className = "embed-frame"
    this.iframe.setAttribute("loading", "lazy")
    this.dom.appendChild(this.iframe)
    this.updateAttrs(node.attrs)
  }

  updateAttrs(attrs) {
    this.iframe.setAttribute("src", attrs.src || "")
    if (attrs.title) {
      this.iframe.setAttribute("title", attrs.title)
    } else {
      this.iframe.removeAttribute("title")
    }
    if (attrs.width) {
      this.iframe.setAttribute("width", attrs.width)
      this.iframe.style.width = attrs.width
    } else {
      this.iframe.removeAttribute("width")
      this.iframe.style.removeProperty("width")
    }
    if (attrs.height) {
      this.iframe.setAttribute("height", attrs.height)
      this.iframe.style.height = attrs.height
    } else {
      this.iframe.removeAttribute("height")
      this.iframe.style.removeProperty("height")
    }
    if (attrs.sandbox) {
      this.iframe.setAttribute("sandbox", attrs.sandbox)
    } else {
      this.iframe.removeAttribute("sandbox")
    }
    if (attrs.allow) {
      this.iframe.setAttribute("allow", attrs.allow)
    } else {
      this.iframe.removeAttribute("allow")
    }
    if (attrs.appState) {
      this.iframe.setAttribute("data-app-state", attrs.appState)
    } else {
      this.iframe.removeAttribute("data-app-state")
    }
  }

  selectNode() {
    this.dom.classList.add("ProseMirror-selectednode")
  }

  deselectNode() {
    this.dom.classList.remove("ProseMirror-selectednode")
  }

  update(node) {
    if (!node.sameMarkup(this.node)) { return false }
    this.node = node
    this.updateAttrs(node.attrs)
    return true
  }

  stopEvent() { return true }
}

export class CellView {
  // For a spreadsheet cell.
  // This just freezes the cell. If an author wants to edit anything in
  // a spreadsheet, they have to toggle the sheet out of spreadsheet mode
  // and into table mode. In table mode, this CellView is not active.
  constructor(node, view) {
    this.node = node
    this.outerView = view
    this.dom = schema.nodes.spreadsheet_cell.spec.toDOM(node)
  }

  selectNode() {
    if (this.dom.children.length > 1) { return }
    this.dom.classList.add("ProseMirror-selectednode")
  }

  deselectNode() {
    this.dom.classList.remove("ProseMirror-selectednode")
  }
  stopEvent() { return true }
}

export class FootnoteView {
  constructor(node, view, getPos) {
    // We'll need these later
    this.node = node
    this.outerView = view
    this.getPos = getPos

    // The node's representation in the editor (empty, for now)
    this.dom = document.createElement("footnote")
    // These are used when the footnote is selected
    this.innerView = null
  }

  selectNode() {
    this.dom.classList.add("ProseMirror-selectednode")
    if (!this.innerView) { this.open() }
  }

  deselectNode() {
    this.dom.classList.remove("ProseMirror-selectednode")
    if (this.innerView) { this.close() }
  }

  open() {
    const tooltip = this.dom.appendChild(document.createElement("div"))
    tooltip.className = "footnote-tooltip"
    this.innerView = new EditorView(tooltip, {
      // Create a whole new editor in the node.
      state: EditorState.create({
        doc: this.node,
        plugins: [keymap({
          "Mod-z": () => undo(this.outerView.state, this.outerView.dispatch),
          "Mod-y": () => redo(this.outerView.state, this.outerView.dispatch),
          'Mod-b': toggleMark(schema.marks.strong),
          'Mod-i': toggleMark(schema.marks.em),
          'Mod-`': toggleMark(schema.marks.code),
          'Mod-,': toggleMark(schema.marks.subscript),
          'Mod-.': toggleMark(schema.marks.superscript),
          'Mod-u': toggleMark(schema.marks.underline)
        })]
      }),
      dispatchTransaction: this.dispatchInner.bind(this),
      handleDOMEvents: {
        mousedown: () => {
          if (this.outerView.hasFocus()) { this.innerView.focus() }
        }
      }
    })
  }

  close() {
    this.innerView.destroy()
    this.innerView = null
    this.dom.textContent = ""
  }

  dispatchInner(tr) {
    const { state, transactions } = this.innerView.state.applyTransaction(tr)
    this.innerView.updateState(state)

    if (!tr.getMeta("fromOutside")) {
      const outerTr = this.outerView.state.tr
      const offsetMap = StepMap.offset(this.getPos() + 1)
      for (let i = 0; i < transactions.length; i++) {
        const steps = transactions[i].steps
        for (let j = 0; j < steps.length; j++) {
          outerTr.step(steps[j].map(offsetMap))
        }
      }
      if (outerTr.docChanged) { this.outerView.dispatch(outerTr) }
    }
  }

  update(node) {
    if (!node.sameMarkup(this.node)) { return false }
    this.node = node
    if (this.innerView) {
      const state = this.innerView.state
      const start = node.content.findDiffStart(state.doc.content)
      if (start != null) {
        let { a: endA, b: endB } = node.content.findDiffEnd(state.doc.content)
        const overlap = start - Math.min(endA, endB)
        if (overlap > 0) { endA += overlap; endB += overlap }
        this.innerView.dispatch(
          state.tr
            .replace(start, endB, node.slice(start, endA))
            .setMeta("fromOutside", true))
      }
    }
    return true
  }

  destroy() {
    if (this.innerView) { this.close() }
  }

  stopEvent(event) {
    return this.innerView && this.innerView.dom.contains(event.target)
  }

  ignoreMutation() { return true }

}
