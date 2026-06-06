// Diff Viewer DOM 结构调试代码
// 请在浏览器控制台中执行此代码，然后复制输出或查看日志文件

(function() {
  console.log('=== Diff Viewer DOM Structure Debug ===');
  
  // 1. 检查 diff viewer 是否存在
  const diffViewer = document.querySelector('.adl-cm-diff-viewer');
  if (!diffViewer) {
    console.error('No diff viewer found!');
    return;
  }
  
  console.log('✓ Diff viewer found:', diffViewer.className);
  console.log('Is side-by-side:', diffViewer.classList.contains('adl-cm-diff-viewer--side-by-side'));
  console.log('Is inline:', diffViewer.classList.contains('adl-cm-diff-viewer--inline'));
  
  // 2. 检查 gutter 结构
  const gutters = diffViewer.querySelectorAll('.cm-gutters');
  console.log('\n=== Gutter Structure ===');
  console.log('Total gutters:', gutters.length);
  
  gutters.forEach((gutter, i) => {
    console.log(`\n--- Gutter ${i} ---`);
    console.log('Class:', gutter.className);
    console.log('Children count:', gutter.children.length);
    console.log('Children classes:', Array.from(gutter.children).map(c => c.className).join(', '));
    
    // 检查特定 gutter 类型
    const changeGutter = gutter.querySelector('.cm-changeGutter');
    const lineNumbers = gutter.querySelector('.cm-lineNumbers');
    const activeLineGutter = gutter.querySelector('.cm-activeLineGutter');
    const changedLineGutter = gutter.querySelector('.cm-changedLineGutter');
    const deletedLineGutter = gutter.querySelector('.cm-deletedLineGutter');
    
    console.log('Has .cm-changeGutter:', !!changeGutter);
    console.log('Has .cm-lineNumbers:', !!lineNumbers);
    console.log('Has .cm-activeLineGutter:', !!activeLineGutter);
    console.log('Has .cm-changedLineGutter:', !!changedLineGutter);
    console.log('Has .cm-deletedLineGutter:', !!deletedLineGutter);
    
    // 获取计算样式
    if (changeGutter) {
      const style = getComputedStyle(changeGutter);
      console.log('cm-changeGutter styles:');
      console.log('  position:', style.position);
      console.log('  left:', style.left);
      console.log('  width:', style.width);
      console.log('  height:', style.height);
      console.log('  backgroundColor:', style.backgroundColor);
    }
    
    if (activeLineGutter) {
      const style = getComputedStyle(activeLineGutter);
      console.log('cm-activeLineGutter styles:');
      console.log('  backgroundColor:', style.backgroundColor);
      console.log('  marginLeft:', style.marginLeft);
      console.log('  paddingLeft:', style.paddingLeft);
    }
  });
  
  // 3. 检查内容行结构
  console.log('\n=== Content Line Structure ===');
  const lines = diffViewer.querySelectorAll('.cm-line');
  console.log('Total lines:', lines.length);
  
  // 检查前 5 行
  lines.slice(0, 5).forEach((line, i) => {
    console.log(`\n--- Line ${i} ---`);
    console.log('Class:', line.className);
    console.log('Has .cm-changedLine:', line.classList.contains('cm-changedLine'));
    console.log('Has .cm-insertedLine:', line.classList.contains('cm-insertedLine'));
    console.log('Has .cm-deletedLine:', line.classList.contains('cm-deletedLine'));
    console.log('Has .cm-activeLine:', line.classList.contains('cm-activeLine'));
    
    const style = getComputedStyle(line);
    console.log('backgroundColor:', style.backgroundColor);
    
    // 检查子元素
    const children = Array.from(line.children);
    console.log('Children:', children.map(c => c.className).join(', '));
  });
  
  // 4. 检查 merge 容器结构
  console.log('\n=== Merge Container Structure ===');
  const mergeA = diffViewer.querySelector('.cm-merge-a');
  const mergeB = diffViewer.querySelector('.cm-merge-b');
  console.log('Has .cm-merge-a:', !!mergeA);
  console.log('Has .cm-merge-b:', !!mergeB);
  
  if (mergeA) {
    const mergeAGutters = mergeA.querySelectorAll('.cm-gutters');
    console.log('merge-a gutters count:', mergeAGutters.length);
    if (mergeAGutters.length > 0) {
      console.log('merge-a gutter[0] classes:', Array.from(mergeAGutters[0].children).map(c => c.className).join(', '));
    }
  }
  
  if (mergeB) {
    const mergeBGutters = mergeB.querySelectorAll('.cm-gutters');
    console.log('merge-b gutters count:', mergeBGutters.length);
    if (mergeBGutters.length > 0) {
      console.log('merge-b gutter[0] classes:', Array.from(mergeBGutters[0].children).map(c => c.className).join(', '));
    }
  }
  
  console.log('\n=== Debug Complete ===');
  console.log('Please copy this output and share it.');
})();
