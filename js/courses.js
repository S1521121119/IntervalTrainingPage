const MANIFEST_URL = 'courses/index.json';

export async function loadCourseList() {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error('無法載入課程清單');
  return res.json(); // array of base names (no .json extension)
}

export async function loadCourse(name) {
  const res = await fetch(`courses/${name}.json`);
  if (!res.ok) throw new Error(`無法載入課程：${name}`);
  return res.json();
}
