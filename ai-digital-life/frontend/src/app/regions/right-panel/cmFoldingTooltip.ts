import { EditorView, ViewPlugin, type PluginValue, ViewUpdate } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { foldedRanges } from "@codemirror/language";

class FoldingTooltipPlugin implements PluginValue {
  private currentTooltip: HTMLElement | null = null;
  private currentHoverTarget: HTMLElement | null = null;

  constructor(private view: EditorView) {
    this.view.dom.addEventListener("mouseover", this.handleMouseOver);
    this.view.dom.addEventListener("mouseout", this.handleMouseOut);
  }

  update(_update: ViewUpdate) {}

  destroy() {
    this.view.dom.removeEventListener("mouseover", this.handleMouseOver);
    this.view.dom.removeEventListener("mouseout", this.handleMouseOut);
    this.removeTooltip();
  }

  private handleMouseOver = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".cm-foldGutter")) return;

    const foldMarker = target.closest(".cm-gutterElement") as HTMLElement;
    if (!foldMarker) return;

    const lineEl = this.getLineNumberFromGutterElement(foldMarker);
    if (lineEl == null) return;

    const folded = this.isLineFolded(lineEl);
    const tooltipText = folded
      ? `展开至第 ${lineEl} 行`
      : `折叠至第 ${lineEl} 行`;

    this.showTooltip(foldMarker, tooltipText);
  };

  private handleMouseOut = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".cm-foldGutter")) {
      this.removeTooltip();
    }
  };

  private getLineNumberFromGutterElement(el: HTMLElement): number | null {
    const gutterElements = this.view.dom.querySelectorAll(".cm-gutters .cm-foldGutter .cm-gutterElement");
    let idx = 0;
    for (const gel of gutterElements) {
      if (gel === el) {
        return idx + 1;
      }
      idx++;
    }
    return null;
  }

  private isLineFolded(lineNumber: number): boolean {
    const pos = this.view.state.doc.line(lineNumber).from;
    let folded = false;
    foldedRanges(this.view.state).between(pos, pos, (from, to) => {
      if (from <= pos && to >= pos) folded = true;
    });
    return folded;
  }

  private showTooltip(anchor: HTMLElement, text: string) {
    this.removeTooltip();
    const tooltip = document.createElement("div");
    tooltip.className = "adl-cm-folding-tooltip";
    tooltip.textContent = text;

    const rect = anchor.getBoundingClientRect();
    tooltip.style.position = "fixed";
    tooltip.style.left = `${rect.left}px`;
    tooltip.style.top = `${rect.bottom + 4}px`;
    tooltip.style.zIndex = "10000";

    document.body.appendChild(tooltip);
    this.currentTooltip = tooltip;
    this.currentHoverTarget = anchor;
  }

  private removeTooltip() {
    if (this.currentTooltip) {
      this.currentTooltip.remove();
      this.currentTooltip = null;
    }
    this.currentHoverTarget = null;
  }
}

export function getFoldingTooltipExtension(): Extension {
  return ViewPlugin.define((view) => new FoldingTooltipPlugin(view));
}
