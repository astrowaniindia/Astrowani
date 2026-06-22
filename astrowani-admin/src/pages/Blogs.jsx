import { useEffect, useState } from 'react';
import client from '../api/client';
import Modal from '../components/Modal';
import RichText from '../components/RichText';
import ImageField from '../components/ImageField';

const EMPTY = {
  title: '', excerpt: '', meta_description: '', thumbnail: '', category_id: '',
  title_en: '', content_en: '', title_hi: '', content_hi: '', is_published: true,
};

export default function Blogs() {
  const [blogs, setBlogs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null); // object or null
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [b, c] = await Promise.all([
      client.get('/api/admin/blogs'),
      client.get('/api/admin/categories'),
    ]);
    setBlogs(b.data.data || []);
    setCategories(c.data.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => setEditing({ ...EMPTY });
  const openEdit = (b) => setEditing({ ...EMPTY, ...b, category_id: b.category_id || '' });

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...editing, category_id: editing.category_id || null };
      if (editing.id) await client.put(`/api/admin/blogs/${editing.id}`, payload);
      else await client.post('/api/admin/blogs', payload);
      setEditing(null);
      await load();
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (b) => {
    if (!confirm(`Delete blog "${b.title}"?`)) return;
    await client.delete(`/api/admin/blogs/${b.id}`);
    await load();
  };

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Blogs</h1>
        <button className="btn" onClick={openNew}>+ New Blog</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th></th><th>Title</th><th>Category</th><th>Status</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="empty">Loading…</td></tr>}
            {!loading && blogs.length === 0 && <tr><td colSpan={6} className="empty">No blogs yet. Create one.</td></tr>}
            {blogs.map((b) => (
              <tr key={b.id}>
                <td>{b.thumbnail ? <img src={b.thumbnail} className="thumb" alt="" /> : null}</td>
                <td>{b.title}</td>
                <td className="muted">{categories.find((c) => c.id === b.category_id)?.name || '—'}</td>
                <td>{b.is_published
                  ? <span className="badge green">Published</span>
                  : <span className="badge gray">Draft</span>}</td>
                <td className="muted">{new Date(b.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="btn-group">
                    <button className="btn secondary sm" onClick={() => openEdit(b)}>Edit</button>
                    <button className="btn danger sm" onClick={() => remove(b)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing.id ? 'Edit Blog' : 'New Blog'} onClose={() => setEditing(null)}>
          <div className="field">
            <label>Title</label>
            <input type="text" value={editing.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          <div className="field">
            <label>Excerpt (short summary on cards)</label>
            <textarea value={editing.excerpt} onChange={(e) => set('excerpt', e.target.value)} />
          </div>
          <div className="field">
            <label>Meta description (SEO)</label>
            <textarea value={editing.meta_description} onChange={(e) => set('meta_description', e.target.value)} />
          </div>
          <ImageField label="Thumbnail (URL or upload)" value={editing.thumbnail} onChange={(v) => set('thumbnail', v)} />
          <div className="field">
            <label>Category</label>
            <select value={editing.category_id} onChange={(e) => set('category_id', e.target.value)}>
              <option value="">— None —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label>English — title</label>
            <input type="text" value={editing.title_en} onChange={(e) => set('title_en', e.target.value)} />
          </div>
          <div className="field">
            <label>English — content</label>
            <RichText value={editing.content_en} onChange={(v) => set('content_en', v)} placeholder="Write the English article…" />
          </div>

          <div className="field">
            <label>Hindi — title</label>
            <input type="text" value={editing.title_hi} onChange={(e) => set('title_hi', e.target.value)} />
          </div>
          <div className="field">
            <label>Hindi — content</label>
            <RichText value={editing.content_hi} onChange={(v) => set('content_hi', v)} placeholder="हिंदी लेख लिखें…" />
          </div>

          <div className="field checkbox-row">
            <input id="pub" type="checkbox" checked={editing.is_published} onChange={(e) => set('is_published', e.target.checked)} />
            <label htmlFor="pub" style={{ margin: 0 }}>Published (visible in customer app)</label>
          </div>

          <div className="actions">
            <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy || !editing.title}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
