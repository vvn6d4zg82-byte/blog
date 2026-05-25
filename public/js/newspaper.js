(function() {
  const auth = window.__INITIAL_DATA__ && window.__INITIAL_DATA__.auth;
  if (!auth) return;

  const blocksContainer = document.getElementById('newspaperBlocks');
  const modal = document.getElementById('blockModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalType = document.getElementById('modalBlockType');
  const modalFields = document.getElementById('modalFields');
  const modalSave = document.getElementById('modalSave');
  const modalCancel = document.getElementById('modalCancel');
  const modalClose = document.getElementById('modalClose');
  const addBtn = document.getElementById('addBlockBtn');

  let editingId = null;
  let modalData = {};

  function getBlocks() {
    return document.querySelectorAll('.np-block[data-id]');
  }

  function getBlockIds() {
    const blocks = getBlocks();
    return Array.from(blocks).map(b => parseInt(b.dataset.id));
  }

  async function reorder() {
    const ids = getBlockIds();
    try {
      await fetch('/api/homepage-blocks/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
    } catch(e) {}
  }

  async function deleteBlock(id) {
    if (!confirm('确定删除这个模块？')) return;
    try {
      await fetch('/api/homepage-blocks/' + id, { method: 'DELETE' });
      document.querySelector(`.np-block[data-id="${id}"]`)?.remove();
      if (!blocksContainer.querySelector('.np-block[data-id]')) {
        blocksContainer.innerHTML = '<div class="np-block np-block-empty"><div class="np-empty-msg">✦ 报纸还没有内容 ✦</div></div>';
      }
    } catch(e) {
      alert('删除失败');
    }
  }

  function moveBlock(id, direction) {
    const block = document.querySelector(`.np-block[data-id="${id}"]`);
    if (!block) return;
    if (direction === 'up' && block.previousElementSibling) {
      block.parentNode.insertBefore(block, block.previousElementSibling);
    } else if (direction === 'down' && block.nextElementSibling) {
      block.parentNode.insertBefore(block.nextElementSibling, block);
    } else {
      return;
    }
    reorder();
  }

  function openModal(type, data, id) {
    editingId = id || null;
    modalData = data || {};
    modal.style.display = 'flex';

    if (id) {
      modalTitle.textContent = '编辑模块';
    } else {
      modalTitle.textContent = '添加模块';
    }

    modalType.value = type || 'heading';
    renderFields(type || 'heading', data || {});
  }

  function closeModal() {
    modal.style.display = 'none';
    editingId = null;
    modalData = {};
  }

  function renderFields(type, data) {
    modalFields.innerHTML = '';
    data = data || {};

    const fields = getFieldsForType(type, data);
    fields.forEach(f => {
      const group = document.createElement('div');
      group.className = 'modal-field-group';
      if (f.type === 'hidden') {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.id = f.id;
        input.value = f.value || '';
        group.appendChild(input);
        modalFields.appendChild(group);
        return;
      }
      const label = document.createElement('label');
      label.htmlFor = f.id;
      label.textContent = f.label;
      group.appendChild(label);

      if (f.type === 'select') {
        const select = document.createElement('select');
        select.id = f.id;
        select.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px';
        (f.options || []).forEach(o => {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          if (o.value === f.value) opt.selected = true;
          select.appendChild(opt);
        });
        group.appendChild(select);
      } else if (f.type === 'textarea') {
        const textarea = document.createElement('textarea');
        textarea.id = f.id;
        textarea.rows = f.rows || 4;
        textarea.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;font-family:inherit;resize:vertical';
        textarea.value = f.value || '';
        group.appendChild(textarea);
      } else if (f.type === 'upload') {
        const uploadArea = document.createElement('div');
        uploadArea.className = 'modal-upload-area';
        uploadArea.id = f.id + '-area';
        uploadArea.textContent = '点击或拖拽文件到此处上传';
        group.appendChild(uploadArea);

        const input = document.createElement('input');
        input.type = 'file';
        input.id = f.id;
        input.style.display = 'none';
        input.accept = f.accept || 'image/*';
        group.appendChild(input);

        const preview = document.createElement('div');
        preview.className = 'modal-upload-preview';
        preview.id = f.id + '-preview';
        group.appendChild(preview);

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.id = f.id + '-url';
        urlInput.placeholder = '或粘贴 URL';
        urlInput.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;margin-top:8px';
        urlInput.value = f.value || '';
        group.appendChild(urlInput);

        uploadArea.addEventListener('click', () => input.click());
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => {
          e.preventDefault();
          uploadArea.classList.remove('dragover');
          if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            handleUpload(input, preview, urlInput);
          }
        });
        input.addEventListener('change', () => {
          if (input.files.length) handleUpload(input, preview, urlInput);
        });

        const captionInput = document.createElement('input');
        captionInput.type = 'text';
        captionInput.id = f.id + '-caption';
        captionInput.placeholder = '图注/说明（可选）';
        captionInput.style.cssText = 'width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;margin-top:8px';
        captionInput.value = data.caption || '';
        group.appendChild(captionInput);

      } else {
        const input = document.createElement('input');
        input.type = f.type || 'text';
        input.id = f.id;
        input.placeholder = f.placeholder || '';
        input.value = f.value || '';
        group.appendChild(input);
      }

      modalFields.appendChild(group);
    });

    modalType.value = type;
  }

  async function handleUpload(input, preview, urlInput) {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    preview.innerHTML = '<p style="color:#999">上传中...</p>';
    try {
      const res = await fetch('/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        urlInput.value = data.url;
        const isVideo = file.type.startsWith('video/');
        if (isVideo) {
          preview.innerHTML = `<video src="${data.url}" controls style="max-width:100%;max-height:200px;border-radius:6px"></video>`;
        } else {
          preview.innerHTML = `<img src="${data.url}" style="max-width:100%;max-height:200px;border-radius:6px">`;
        }
      }
    } catch(e) {
      preview.innerHTML = '<p style="color:#c00">上传失败</p>';
    }
  }

  function getFieldsForType(type, data) {
    switch(type) {
      case 'heading':
        return [
          { id: 'heading-text', label: '标题文字', type: 'text', value: data.text || '', placeholder: '输入标题...' },
          { id: 'heading-level', label: '字号', type: 'select', value: (data.level || 2).toString(), options: [
            { value: '1', label: '大号' },
            { value: '2', label: '中号' },
            { value: '3', label: '小号' }
          ]}
        ];
      case 'text':
        return [
          { id: 'text-content', label: '正文内容', type: 'textarea', value: data.text || '', rows: 6, placeholder: '输入正文...' }
        ];
      case 'image':
        return [
          { id: 'image-upload', label: '图片', type: 'upload', value: data.url || '', accept: 'image/*' }
        ];
      case 'video':
        return [
          { id: 'video-upload', label: '视频', type: 'upload', value: data.url || '', accept: 'video/*' }
        ];
      case 'divider':
        return [];
      case 'posts-grid':
        return [
          { id: 'posts-count', label: '显示文章数', type: 'number', value: (data.count || 6).toString(), placeholder: '6' }
        ];
      default:
        return [];
    }
  }

  function collectFormData(type) {
    switch(type) {
      case 'heading': {
        const text = document.getElementById('heading-text')?.value || '';
        const level = parseInt(document.getElementById('heading-level')?.value || '2');
        return { text, level };
      }
      case 'text': {
        const text = document.getElementById('text-content')?.value || '';
        return { text };
      }
      case 'image': {
        const url = document.getElementById('image-upload-url')?.value || '';
        const caption = document.getElementById('image-upload-caption')?.value || '';
        return { url, caption };
      }
      case 'video': {
        const url = document.getElementById('video-upload-url')?.value || '';
        const caption = document.getElementById('video-upload-caption')?.value || '';
        return { url, caption };
      }
      case 'divider':
        return {};
      case 'posts-grid': {
        const count = parseInt(document.getElementById('posts-count')?.value || '6');
        return { count };
      }
      default:
        return {};
    }
  }

  async function saveBlock() {
    const type = modalType.value;
    const data = collectFormData(type);

    try {
      if (editingId) {
        await fetch('/api/homepage-blocks/' + editingId, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, data })
        });
      } else {
        await fetch('/api/homepage-blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, data })
        });
      }
      closeModal();
      location.reload();
    } catch(e) {
      alert('保存失败: ' + e.message);
    }
  }

  modalType.addEventListener('change', function() {
    const data = collectFormData(modalType.value);
    renderFields(this.value, {});
  });

  modalSave.addEventListener('click', saveBlock);

  function cancelModal() {
    closeModal();
  }
  modalCancel.addEventListener('click', cancelModal);
  modalClose.addEventListener('click', cancelModal);
  modal.addEventListener('click', function(e) {
    if (e.target === modal) cancelModal();
  });

  if (addBtn) {
    addBtn.addEventListener('click', function() {
      openModal('heading', {});
    });
  }

  blocksContainer.addEventListener('click', function(e) {
    const btn = e.target.closest('.np-btn');
    if (!btn) return;
    const block = btn.closest('.np-block[data-id]');
    if (!block) return;
    const id = parseInt(block.dataset.id);
    const type = block.dataset.type;

    if (btn.classList.contains('np-btn-up')) {
      moveBlock(id, 'up');
    } else if (btn.classList.contains('np-btn-down')) {
      moveBlock(id, 'down');
    } else if (btn.classList.contains('np-btn-delete')) {
      deleteBlock(id);
    } else if (btn.classList.contains('np-btn-edit')) {
      const dataEl = block.querySelector('.np-block-content');
      let data = {};
      if (type === 'heading') {
        const h = dataEl.querySelector('.np-heading');
        const level = h ? parseInt(h.tagName.slice(1)) : 2;
        data = { text: h?.textContent || '', level };
      } else if (type === 'text') {
        data = { text: dataEl.querySelector('.np-text')?.innerHTML || '' };
      } else if (type === 'image') {
        const img = dataEl.querySelector('img');
        const cap = dataEl.querySelector('.np-caption');
        data = { url: img?.src || '', caption: cap?.textContent || '' };
      } else if (type === 'video') {
        const video = dataEl.querySelector('video source');
        const cap = dataEl.querySelector('.np-caption');
        data = { url: video?.src || '', caption: cap?.textContent || '' };
      } else if (type === 'divider') {
        data = {};
      } else if (type === 'posts-grid') {
        const cards = dataEl.querySelectorAll('.np-post-card');
        data = { count: cards.length || 6 };
      }
      openModal(type, data, id);
    }
  });
})();