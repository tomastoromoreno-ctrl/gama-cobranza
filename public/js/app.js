// public/js/app.js
document.addEventListener('DOMContentLoaded', () => {
    let allInvoices = [];
    let currentUser = null; // Variable para almacenar la info del usuario

    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const logoutBtn = document.getElementById('logout-btn');
    const estadoFilter = document.getElementById('estado-filter');
    const clienteSearch = document.getElementById('cliente-search');
    const exportPdfBtn = document.getElementById('export-pdf');
    const downloadBtn = document.getElementById('download-btn');

    // Obtener información del usuario actual
    fetch('/api/auth/current')
        .then(response => response.json())
        .then(data => {
            currentUser = data.user;
            console.log('Usuario actual:', currentUser);
            // No necesitamos hacer nada más aquí, solo almacenar la info
        })
        .catch(error => {
            console.error('Error al obtener información del usuario:', error);
            // Si hay error, asumimos que no está logueado y se redirigirá al login
        });

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            // Limpiar token si se usa
            localStorage.removeItem('token'); // Ajusta según tu implementación
            window.location.href = '/';
        });
    }

    // File upload
    if (dropArea && fileInput) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, unhighlight, false);
        });

        function highlight() {
            dropArea.style.borderColor = '#2d4a7c';
            dropArea.style.background = '#f0f9ff';
        }

        function unhighlight() {
            dropArea.style.borderColor = '#1a365d';
            dropArea.style.background = 'white';
        }

        dropArea.addEventListener('drop', handleDrop, false);
        dropArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', uploadFile);

        function handleDrop(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length) {
                fileInput.files = dt.files;
                uploadFile();
            }
        }

        function uploadFile() {
            const formData = new FormData();
            const file = fileInput.files[0];
            if (!file) return;

            formData.append('file', file);

            fetch('/api/cobranza/upload', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                alert(data.message);
                loadInvoices();
            })
            .catch(error => {
                alert('❌ Error: ' + error.message);
            });
        }
    }

    // Load invoices
    function loadInvoices() {
        fetch('/api/cobranza')
            .then(response => response.json())
            .then(data => {
                allInvoices = data;
                renderTable(data);
                updateSummary(data);
            })
            .catch(error => {
                console.error('Error loading invoices:', error);
            });
    }

    // Render table with filters
    function renderTable(data) {
        const tableBody = document.getElementById('table-body');
        if (!tableBody) return;

        // Aplicar filtros
        let filteredData = data;

        // Filtro por estado
        const estadoValue = estadoFilter.value;
        if (estadoValue) {
            filteredData = filteredData.filter(f => f.estado === estadoValue);
        }

        // Filtro por cliente
        const clienteValue = clienteSearch.value.toLowerCase();
        if (clienteValue) {
            filteredData = filteredData.filter(f => 
                f.razonSocial.toLowerCase().includes(clienteValue)
            );
        }

        tableBody.innerHTML = '';
        filteredData.forEach(factura => {
            const tr = document.createElement('tr');
            
            // Formatear fechas
            const formatDate = (date) => {
                if (!date) return '';
                const d = new Date(date);
                return d.toISOString().split('T')[0];
            };

            // Formatear monto con separador de miles
            const formatNumber = (num) => {
                return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            };

            // Determinar si mostrar botón de eliminar
            const isAdmin = currentUser && currentUser.email === 'admin@admin.com';
            const deleteButtonHtml = isAdmin ? 
                `<button class="btn btn-danger" onclick="deleteRow('${factura._id}')">🗑️ Eliminar</button>` :
                `<span style="color: #94a3b8;">Sin permisos</span>`;

            tr.innerHTML = `
                <td>${factura.numeroFactura}</td>
                <td>${factura.razonSocial}</td>
                <td>${formatDate(factura.fechaFactura)}</td>
                <td style="text-align: right;">${formatNumber(factura.monto)}</td>
                <td>
                    <select class="editable-field" data-id="${factura._id}" data-field="estado">
                        <option value="Pendiente" ${factura.estado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                        <option value="Pagado" ${factura.estado === 'Pagado' ? 'selected' : ''}>Pagado</option>
                        <option value="Vencido" ${factura.estado === 'Vencido' ? 'selected' : ''}>Vencido</option>
                    </select>
                </td>
                <td>
                    <select class="editable-field" data-id="${factura._id}" data-field="prioridad">
                        <option value="Alta" ${factura.prioridad === 'Alta' ? 'selected' : ''}>Alta</option>
                        <option value="Media" ${factura.prioridad === 'Media' ? 'selected' : ''}>Media</option>
                        <option value="Baja" ${factura.prioridad === 'Baja' ? 'selected' : ''}>Baja</option>
                    </select>
                </td>
                <td>
                    <input type="date" class="editable-field" data-id="${factura._id}" data-field="proximaLlamada" value="${formatDate(factura.proximaLlamada)}">
                </td>
                <td>
                    <input type="date" class="editable-field" data-id="${factura._id}" data-field="fechaPago" value="${formatDate(factura.fechaPago)}">
                </td>
                <td>
                    <input type="text" class="editable-field" data-id="${factura._id}" data-field="notas" value="${factura.notas || ''}" placeholder="Notas...">
                </td>
                <td>
                    ${deleteButtonHtml}
                </td>
            `;
            tableBody.appendChild(tr);
        });

        // Agregar eventos de cambio
        document.querySelectorAll('.editable-field').forEach(field => {
            field.addEventListener('change', handleFieldChange);
        });
    }

    // Handle field change
    function handleFieldChange(e) {
        const field = e.target;
        const facturaId = field.dataset.id;
        const fieldName = field.dataset.field;
        let value = field.value;

        // Convertir fechas a objetos Date si es necesario
        if (fieldName === 'fechaPago' || fieldName === 'proximaLlamada') {
            value = value ? new Date(value) : null;
        }

        // Actualizar en el servidor
        fetch(`/api/cobranza/${facturaId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ [fieldName]: value })
        })
        .then(response => response.json())
        .then(data => {
            // Actualizar localmente
            const index = allInvoices.findIndex(f => f._id === facturaId);
            if (index !== -1) {
                allInvoices[index][fieldName] = value;
                updateSummary(allInvoices);
            }
            alert('✅ Cambio guardado');
        })
        .catch(error => {
            alert('❌ Error al guardar cambios: ' + error.message);
        });
    }

    // Update summary
    function updateSummary(data) {
        const totalPagado = data.filter(r => r.estado === 'Pagado').reduce((sum, r) => sum + r.monto, 0);
        const totalPendiente = data.filter(r => r.estado === 'Pendiente').reduce((sum, r) => sum + r.monto, 0);
        const totalVencido = data.filter(r => r.estado === 'Vencido').reduce((sum, r) => sum + r.monto, 0);
        const total = totalPagado + totalPendiente + totalVencido;
        const morosidad = total > 0 ? ((totalVencido / total) * 100).toFixed(1) : 0;

        document.getElementById('total-pagado').textContent = formatNumber(totalPagado);
        document.getElementById('total-pendiente').textContent = formatNumber(totalPendiente);
        document.getElementById('total-vencido').textContent = formatNumber(totalVencido);
        document.getElementById('morosidad').textContent = `${morosidad}%`;
    }

    function formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    }

    // Event listeners for filters
    if (estadoFilter) {
        estadoFilter.addEventListener('change', () => {
            renderTable(allInvoices);
        });
    }

    if (clienteSearch) {
        clienteSearch.addEventListener('input', () => {
            renderTable(allInvoices);
        });
    }

    // Export to PDF
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', () => {
            exportToPDF();
        });
    }

    function exportToPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(20);
        doc.text('Reporte de Cobranza - Gama Seguridad', 14, 22);
        doc.setFontSize(12);
        doc.text(`Generado el: ${new Date().toLocaleDateString('es-ES')}`, 14, 30);

        const tableData = allInvoices.map(f => [
            f.numeroFactura,
            f.razonSocial,
            f.fechaFactura ? new Date(f.fechaFactura).toLocaleDateString('es-ES') : '',
            f.fechaVencimiento ? new Date(f.fechaVencimiento).toLocaleDateString('es-ES') : '',
            f.monto.toLocaleString('es-ES'),
            f.estado,
            f.prioridad,
            f.proximaLlamada ? new Date(f.proximaLlamada).toLocaleDateString('es-ES') : '',
            f.fechaPago ? new Date(f.fechaPago).toLocaleDateString('es-ES') : '',
            f.notas || ''
        ]);

        doc.autoTable({
            head: [['N° Factura', 'Razón Social', 'Fecha Factura', 'Fecha Vencimiento', 'Monto', 'Estado', 'Prioridad', 'Próxima Llamada', 'Fecha Pago', 'Notas']],
            body: tableData,
            startY: 40,
            theme: 'grid',
            headStyles: { fillColor: [26, 54, 93] },
            styles: { fontSize: 8 }
        });

        doc.save('gama_seguridad_cobranza.pdf');
    }

    // Download Excel
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            window.location.href = '/api/cobranza/download';
        });
    }

    // Inicializar
    loadInvoices();
});

// Delete invoice - Solo para admin@admin.com
function deleteRow(id) {
    if (confirm('¿Eliminar esta factura? Solo el administrador puede hacerlo.')) {
        fetch(`/api/cobranza/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw new Error(err.error || 'Error desconocido'); });
            }
            return response.json();
        })
        .then(data => {
            alert(data.message);
            location.reload();
        })
        .catch(error => {
            alert('❌ Error al eliminar factura: ' + error.message);
        });
    }
}