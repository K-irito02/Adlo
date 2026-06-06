// 检查 diff viewer 的 DOM 结构
(function() {
  const diffViewer = document.querySelector('.adl-cm-diff-viewer');
  if (!diffViewer) {
    return JSON.stringify({error: 'No diff viewer found'});
  }

  const result = {
    diffViewerClass: diffViewer.className,
    gutterStructure: [],
    lineStructure: []
  };

  // 获取 gutter 结构
  const gutters = diffViewer.querySelectorAll('.cm-gutters');
  gutters.forEach((gutter, i) => {
    const info = {
      index: i,
      className: gutter.className,
      children: Array.from(gutter.children).map(c => c.className),
      computedStyle: {
        display: getComputedStyle(gutter).display,
        position: getComputedStyle(gutter).position
      }
    };
    result.gutterStructure.push(info);
  });

  // 获取内容行结构
  const lines = diffViewer.querySelectorAll('.cm-line');
  lines.slice(0, 3).forEach((line, i) => {
    const info = {
      index: i,
      className: line.className,
      childClasses: Array.from(line.children).map(c => c.className),
      computedBg: getComputedStyle(line).backgroundColor
    };
    result.lineStructure.push(info);
  });

  // 检查 cm-activeLineGutter 的位置
  const activeGutters = diffViewer.querySelectorAll('.cm-activeLineGutter');
  result.activeLineGutters = activeGutters.length;
  if (activeGutters.length > 0) {
    const ag = activeGutters[0];
    result.activeLineGutterSample = {
      className: ag.className,
      parentClassName: ag.parentElement?.className,
      computedBg: getComputedStyle(ag).backgroundColor,
      computedMarginLeft: getComputedStyle(ag).marginLeft,
      computedPaddingLeft: getComputedStyle(ag).paddingLeft
    };
  }

  // 检查变更行的特定类
  const changedLines = diffViewer.querySelectorAll('.cm-changedLine, .cm-insertedLine, .cm-deletedLine');
  result.changedLinesCount = changedLines.length;
  if (changedLines.length > 0) {
    result.changedLineSample = {
      className: changedLines[0].className,
      parentClassName: changedLines[0].parentElement?.className,
      computedBg: getComputedStyle(changedLines[0]).backgroundColor
    };
  }

  return JSON.stringify(result, null, 2);
})();
