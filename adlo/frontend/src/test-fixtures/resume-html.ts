export function buildResumeHtml(): string {
  const lines: string[] = ["<!DOCTYPE html>", "<html lang='en'>", "<head>", "  <meta charset='UTF-8'>", "  <title>Resume</title>", "  <style>"];
  for (let i = 0; i < 50; i++) {
    lines.push("    .section-" + i + " { margin: " + i + "px; padding: " + (i * 2) + "px; }");
  }
  lines.push("  </style>", "</head>", "<body>");
  for (let i = 0; i < 500; i++) {
    lines.push("  <div class='section-" + (i % 50) + "'>");
    lines.push("    <h2>Section " + i + "</h2>");
    lines.push("    <p>Content for section " + i + ". This is sample text for testing minimap diff colors.</p>");
    lines.push("    <ul>");
    lines.push("      <li>Item 1 of section " + i + "</li>");
    lines.push("      <li>Item 2 of section " + i + "</li>");
    lines.push("    </ul>");
    lines.push("  </div>");
  }
  lines.push("</body>", "</html>");
  return lines.join("\n");
}

export function buildResumeHtmlModified(): string {
  const lines: string[] = ["<!DOCTYPE html>", "<html lang='en'>", "<head>", "  <meta charset='UTF-8'>", "  <title>Resume Updated</title>", "  <style>"];
  for (let i = 0; i < 50; i++) {
    lines.push("    .section-" + i + " { margin: " + i + "px; padding: " + (i * 2) + "px; }");
  }
  lines.push("  </style>", "</head>", "<body>");
  for (let i = 0; i < 500; i++) {
    if (i >= 1460 && i <= 1480) {
      lines.push("  <div class='section-" + (i % 50) + " updated'>");
      lines.push("    <h2>Section " + i + " - MODIFIED</h2>");
      lines.push("    <p>Updated content for section " + i + ". This line was changed.</p>");
      lines.push("    <p>New line added in section " + i + ".</p>");
      lines.push("  </div>");
    } else if (i === 200) {
      continue;
    } else {
      lines.push("  <div class='section-" + (i % 50) + "'>");
      lines.push("    <h2>Section " + i + "</h2>");
      lines.push("    <p>Content for section " + i + ". This is sample text for testing minimap diff colors.</p>");
      lines.push("    <ul>");
      lines.push("      <li>Item 1 of section " + i + "</li>");
      lines.push("      <li>Item 2 of section " + i + "</li>");
      lines.push("    </ul>");
      lines.push("  </div>");
    }
  }
  lines.push("</body>", "</html>");
  return lines.join("\n");
}
