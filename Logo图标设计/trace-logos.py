"""
将 PNG Logo 自动矢量化为 SVG（OpenCV 轮廓检测）
用法: chcp 65001 && python -X utf8 trace-logos.py
"""

import cv2
import numpy as np
import os
import sys

# Windows 中文路径支持
if sys.platform == 'win32':
    os.environ['PYTHONIOENCODING'] = 'utf-8'


def read_image_utf8(path: str) -> np.ndarray:
    """用 numpy 读取含中文路径的图片"""
    with open(path, 'rb') as f:
        data = np.frombuffer(f.read(), dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_GRAYSCALE)
    return img


def trace_png_to_svg(png_path: str, svg_path: str):
    """将 PNG 图像转为矢量 SVG（纯路径）"""
    img = read_image_utf8(png_path)
    if img is None:
        raise FileNotFoundError(f"无法读取: {png_path}")

    h, w = img.shape

    # 二值化（白底黑字 → 黑底白字）
    _, binary = cv2.threshold(img, 200, 255, cv2.THRESH_BINARY_INV)

    # 查找轮廓
    contours, hierarchy = cv2.findContours(
        binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE
    )

    if not contours:
        raise ValueError(f"未找到轮廓: {png_path}")

    # 收集所有路径
    paths = []
    for i, contour in enumerate(contours):
        # 简化轮廓（减少节点，保留形状）
        epsilon = 0.001 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)

        if len(approx) < 3:
            continue

        # 构建 SVG path d 属性
        d_parts = []
        for j, point in enumerate(approx):
            x, y = point[0]
            if j == 0:
                d_parts.append(f"M{x},{y}")
            else:
                d_parts.append(f"L{x},{y}")
        d_parts.append("Z")
        paths.append("".join(d_parts))

    if not paths:
        raise ValueError(f"未生成有效路径: {png_path}")

    # 生成 SVG
    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
  <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
'''
    for d in paths:
        svg_content += f'    <path d="{d}"/>\n'
    svg_content += '''  </g>
</svg>'''

    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(svg_content)

    print(f"✓ {os.path.basename(png_path)} → {os.path.basename(svg_path)} ({len(paths)} 条路径)")


if __name__ == "__main__":
    base = os.path.dirname(os.path.abspath(__file__))

    trace_png_to_svg(
        os.path.join(base, "中文Logo", "可燃.png"),
        os.path.join(base, "中文Logo", "可燃-vector.svg"),
    )
    trace_png_to_svg(
        os.path.join(base, "英文Logo", "Kora.png"),
        os.path.join(base, "英文Logo", "Kora-vector.svg"),
    )
    print("完成！")
