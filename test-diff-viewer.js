// Check diff viewer structure and styles
(function() {
  // Check if diff viewer exists
  const diffViewer = document.querySelector('.adl-cm-diff-viewer');
  if (!diffViewer) {
    return JSON.stringify({
      error: 'Diff viewer not found',
      foundClasses: Array.from(document.querySelectorAll('[class*="diff"]')).map(e => e.className)
    });
  }

  // Get the diff viewer structure
  const result = {
    diffViewerExists: true,
    diffViewerClass: diffViewer.className,
    hasSideBySide: diffViewer.classList.contains('adl-cm-diff-viewer--side-by-side'),
    hasInline: diffViewer.classList.contains('adl-cm-diff-viewer--inline'),
    gutters: [],
    changeGutters: [],
    activeLineGutters: [],
    lines: []
  };

  // Get gutter info
  const gutters = diffViewer.querySelectorAll('.cm-gutters');
  gutters.forEach((gutter, i) => {
    const gutterInfo = {
      index: i,
      className: gutter.className,
      computedStyle: {
        position: getComputedStyle(gutter).position,
        marginLeft: getComputedStyle(gutter).marginLeft
      }
    };

    // Check for change gutter
    const changeGutter = gutter.querySelector('.cm-changeGutter');
    if (changeGutter) {
      gutterInfo.changeGutter = {
        className: changeGutter.className,
        computedStyle: {
          position: getComputedStyle(changeGutter).position,
          left: getComputedStyle(changeGutter).left,
          width: getComputedStyle(changeGutter).width,
          zIndex: getComputedStyle(changeGutter).zIndex
        }
      };
    }

    // Check for active line gutter
    const activeGutter = gutter.querySelector('.cm-activeLineGutter');
    if (activeGutter) {
      gutterInfo.activeLineGutter = {
        className: activeGutter.className,
        computedStyle: {
          position: getComputedStyle(activeGutter).position,
          marginLeft: getComputedStyle(activeGutter).marginLeft,
          paddingLeft: getComputedStyle(activeGutter).paddingLeft,
          backgroundColor: getComputedStyle(activeGutter).backgroundColor
        }
      };
    }

    result.gutters.push(gutterInfo);
  });

  // Get first few changed lines
  const lines = diffViewer.querySelectorAll('.cm-line');
  lines.slice(0, 5).forEach((line, i) => {
    const lineInfo = {
      index: i,
      className: line.className,
      hasChangedLine: line.classList.contains('cm-changedLine'),
      hasInsertedLine: line.classList.contains('cm-insertedLine'),
      hasDeletedLine: line.classList.contains('cm-deletedLine'),
      hasActiveLine: line.classList.contains('cm-activeLine'),
      computedStyle: {
        backgroundColor: getComputedStyle(line).backgroundColor
      }
    };

    // Check for child elements
    const childElements = Array.from(line.children).map(child => child.className);
    lineInfo.childClasses = childElements;

    result.lines.push(lineInfo);
  });

  return JSON.stringify(result, null, 2);
})();
