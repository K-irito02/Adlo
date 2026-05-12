import { EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

type DiffBlockKind = "delete" | "insert" | "modify";

type DiffBlockLayout = {
  height: number;
  kind: DiffBlockKind;
  top: number;
};

type DiffBlockMeasure = {
  blocks: DiffBlockLayout[];
  layerLeft: number;
};

const LINE_SELECTOR = [
  ".cm-insertedLine",
  ".cm-deletedLine",
  ".cm-changedLine",
  ".adl-cm-agent-block-insert",
  ".adl-cm-agent-block-modify",
  ".adl-cm-agent-block-delete",
].join(", ");

function classifyDiffBlock(element: Element): DiffBlockKind | null {
  const classList = element.classList;
  if (classList.contains("cm-deletedLine") || classList.contains("adl-cm-agent-block-delete")) {
    return "delete";
  }
  if (classList.contains("cm-changedLine") || classList.contains("adl-cm-agent-block-modify")) {
    return "modify";
  }
  if (classList.contains("cm-insertedLine") || classList.contains("adl-cm-agent-block-insert")) {
    return "insert";
  }
  return null;
}

class DiffBlockLayerPlugin implements PluginValue {
  private readonly layerDom: HTMLDivElement;
  private readonly hostDom: HTMLElement;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly handleScroll = () => this.scheduleMeasure();

  constructor(private readonly view: EditorView) {
    this.hostDom = this.findLayerHost();
    this.layerDom = document.createElement("div");
    this.layerDom.className = "adl-cm-diff-block-layer-root";
    this.hostDom.appendChild(this.layerDom);
    this.view.scrollDOM.addEventListener("scroll", this.handleScroll, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.scheduleMeasure());
      this.resizeObserver.observe(this.hostDom);
      this.resizeObserver.observe(this.view.dom);
      this.resizeObserver.observe(this.view.scrollDOM);
      this.resizeObserver.observe(this.view.contentDOM);
    } else {
      this.resizeObserver = null;
    }
    this.scheduleMeasure();
  }

  private findLayerHost(): HTMLElement {
    const sideBySideViewer = this.view.dom.closest<HTMLElement>(".adl-cm-diff-viewer--side-by-side");
    if (sideBySideViewer) return this.view.dom;
    return this.view.dom.closest<HTMLElement>(".adl-tool-editor__surface") ?? this.view.dom;
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged || update.geometryChanged) {
      this.scheduleMeasure();
    }
  }

  destroy(): void {
    this.view.scrollDOM.removeEventListener("scroll", this.handleScroll);
    this.resizeObserver?.disconnect();
    this.layerDom.remove();
  }

  private scheduleMeasure(): void {
    this.view.requestMeasure({
      read: () => this.readLayout(),
      write: (measure) => this.writeLayout(measure),
    });
  }

  private readLayout(): DiffBlockMeasure {
    const hostRect = this.hostDom.getBoundingClientRect();
    const editorRect = this.view.dom.getBoundingClientRect();
    const gutterRect = this.view.dom.querySelector<HTMLElement>(".cm-gutters")?.getBoundingClientRect();
    const layerLeft = Math.max(0, (gutterRect?.right ?? editorRect.left) - hostRect.left);
    const blocks: DiffBlockLayout[] = [];
    const lineElements = this.view.contentDOM.querySelectorAll<HTMLElement>(LINE_SELECTOR);

    for (const lineElement of lineElements) {
      const kind = classifyDiffBlock(lineElement);
      if (!kind) continue;
      const rect = lineElement.getBoundingClientRect();
      if (rect.height <= 0) continue;
      const top = rect.top - hostRect.top;
      const bottom = rect.bottom - hostRect.top;
      const previous = blocks[blocks.length - 1];
      if (previous && previous.kind === kind && top <= previous.top + previous.height + 3) {
        previous.height = Math.max(previous.height, bottom - previous.top);
        continue;
      }
      blocks.push({
        kind,
        top,
        height: Math.max(1, bottom - top),
      });
    }

    return {
      blocks,
      layerLeft,
    };
  }

  private writeLayout(measure: DiffBlockMeasure): void {
    this.layerDom.style.left = `${measure.layerLeft}px`;

    const fragment = document.createDocumentFragment();
    for (const block of measure.blocks) {
      const node = document.createElement("div");
      node.className = `adl-cm-diff-block-layer adl-cm-diff-block-layer--${block.kind}`;
      node.style.top = `${block.top}px`;
      node.style.height = `${block.height}px`;
      fragment.appendChild(node);
    }
    this.layerDom.replaceChildren(fragment);
  }
}

export function getDiffBlockLayerExtension(): Extension {
  return ViewPlugin.define((view) => new DiffBlockLayerPlugin(view));
}
