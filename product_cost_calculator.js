document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('cost-calculator-body');
    const addProductBtn = document.getElementById('add-product-row-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const copyTotalBtn = document.getElementById('copy-total-btn');
    const totalDoseCostEl = document.getElementById('total-dose-cost');

    const extraTaxInput = document.getElementById('extra-tax-input');
    const GENERAL_CALCULATOR_KEY = 'productCostCalculatorState_general';
    const SETTINGS_KEY = 'productCostCalculatorSettings'; // Chave para configurações globais da calculadora

    let products = [];
    let editingProductId = null;

    let currentCalculatorKey = GENERAL_CALCULATOR_KEY;
    let calculatorSettings = { extraTax: 0 }; // Estado para as configurações
    // --- FUNÇÕES DE FORMATAÇÃO E PARSE ---
    const formatCurrency = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const parseFormattedNumber = (value) => parseFloat(String(value).replace(/\./g, '').replace(',', '.')) || 0;
    const formatNumberForDisplay = (value) => {
        // Se o valor for 0, retorna uma string vazia para o placeholder funcionar
        if (value === 0) return '';
        // Formata o número para o padrão brasileiro (ex: 1234.5 -> "1.234,50")
        return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Função para sanitizar a entrada em campos numéricos, removendo caracteres não permitidos
    const sanitizeNumericOnInput = (event) => {
        const input = event.target;
        let value = input.value;
        // Permite apenas uma vírgula
        const parts = value.split(',');
        if (parts.length > 2) {
            value = parts[0] + ',' + parts.slice(1).join('');
        }
        // Remove qualquer caractere que não seja um dígito ou a vírgula
        input.value = value.replace(/[^0-9,]/g, '');
    };

    // --- LÓGICA PRINCIPAL ---
    const calculateRow = (row) => {
        const productId = row.dataset.rowId;
        const product = products.find(p => p.id === productId);
        if (!product) return 0;

        const price = parseFloat(product.price) || 0;
        const volume = parseFloat(product.volume) || 0;
        const usage = parseFloat(product.usage) || 0;

        const pricePerGram = (volume > 0) ? (price / volume) : 0;
        const doseValue = pricePerGram * usage;

        const pricePerGramEl = row.querySelector('.price-per-gram');
        const doseValueEl = row.querySelector('.dose-value');
        if (pricePerGramEl) pricePerGramEl.textContent = pricePerGram > 0 ? formatCurrency(pricePerGram) : '-';
        if (doseValueEl) doseValueEl.textContent = doseValue > 0 ? formatCurrency(doseValue) : '-';

        return doseValue;
    };

    const calculateTotal = () => {
        let subTotal = 0;
        const rows = tableBody.querySelectorAll('tr');
        products.forEach(product => {
            const price = parseFloat(product.price) || 0;
            const volume = parseFloat(product.volume) || 0;
            const usage = parseFloat(product.usage) || 0;
            const pricePerGram = (volume > 0) ? (price / volume) : 0;
            subTotal += pricePerGram * usage;
        });

        // Aplica a taxa extra
        const extraTax = calculatorSettings.extraTax || 0;
        const total = subTotal * (1 + extraTax);
        totalDoseCostEl.textContent = formatCurrency(total);
        // Atualiza o contador de produtos
        const productCount = rows.length;
        const productCountDisplay = document.getElementById('product-count-display');
        productCountDisplay.textContent = `${productCount} ${productCount === 1 ? 'produto' : 'produtos'}`;

        saveState();
        renderTable();
    };

    const updatePlaceholders = () => {
        const rows = tableBody.querySelectorAll('tr');
        const placeholders = {
            name: 'Ex: Shampoo',
            price: '290,00',
            volume: '1000',
            usage: '6'
        };

        rows.forEach((row, index) => {
            const isFirstRow = index === 0;
            row.querySelector('[data-col="name"]').placeholder = isFirstRow ? placeholders.name : '';
            row.querySelector('[data-col="price"]').placeholder = isFirstRow ? placeholders.price : '';
            row.querySelector('[data-col="volume"]').placeholder = isFirstRow ? placeholders.volume : '';
            row.querySelector('[data-col="usage"]').placeholder = isFirstRow ? placeholders.usage : '';
        });
    };

    const createRow = (product, isEditing) => {
        const row = document.createElement('tr');
        row.dataset.rowId = product.id;

        const priceAsNumber = parseFloat(product.price) || 0;
        const volumeAsNumber = parseFloat(product.volume) || 0;
        const usageAsNumber = parseFloat(product.usage) || 0;
        const unit = product.unit || 'g';

        const pricePerGram = (volumeAsNumber > 0) ? (priceAsNumber / volumeAsNumber) : 0;
        const doseValue = pricePerGram * usageAsNumber;

        if (isEditing) {
            row.classList.add('editing-row');
            row.innerHTML = `
                <td><input type="text" class="text-input" placeholder="Ex: Shampoo" value="${product.name}" data-col="name"></td>
                <td>
                    <select class="select-input" data-col="unit">
                        <option value="g" ${unit === 'g' ? 'selected' : ''}>g</option>
                        <option value="ml" ${unit === 'ml' ? 'selected' : ''}>ml</option>
                        <option value="Unid." ${unit === 'Unid.' ? 'selected' : ''}>Unid.</option>
                    </select>
                </td>
                <td><input type="text" class="number-input formatted-number-input" placeholder="290,00" value="${formatNumberForDisplay(priceAsNumber)}" data-col="price" data-raw-value="${priceAsNumber.toFixed(2)}"></td>
                <td>
                    <div class="input-with-unit">
                        <input type="text" class="number-input" placeholder="1000" value="${product.volume}" data-col="volume">
                        <span class="unit-display">${unit}</span>
                    </div>
                </td>
                <td class="price-per-gram">${pricePerGram > 0 ? formatCurrency(pricePerGram) : '-'}</td>
                <td>
                    <div class="input-with-unit">
                        <input type="text" class="number-input" placeholder="6" value="${product.usage}" data-col="usage">
                        <span class="unit-display">${unit}</span>
                    </div>
                </td>
                <td class="dose-value">${doseValue > 0 ? formatCurrency(doseValue) : '-'}</td>
                <td>
                    <button class="action-btn save-row-btn" title="Salvar Alterações">✔️</button>
                </td>
            `;
        } else {
            row.innerHTML = `
                <td>${product.name}</td>
                <td>${unit}</td>
                <td>${formatCurrency(priceAsNumber)}</td>
                <td>${product.volume} ${unit}</td>
                <td class="price-per-gram">${pricePerGram > 0 ? formatCurrency(pricePerGram) : '-'}</td>
                <td>${product.usage} ${unit}</td>
                <td class="dose-value">${doseValue > 0 ? formatCurrency(doseValue) : '-'}</td>
                <td>
                    <button class="action-btn edit-row-btn" title="Editar Produto">✏️</button>
                    <button class="action-btn remove-row-btn" title="Remover Produto">🗑️</button>
                </td>
            `;
        }

        return row;
    };

    const renderTable = () => {
        tableBody.innerHTML = '';
        products.forEach(product => {
            const isEditing = product.id === editingProductId;
            const row = createRow(product, isEditing);
            tableBody.appendChild(row);
        });
        updatePlaceholders();
    };

    const addRow = () => {
        const newProduct = { id: crypto.randomUUID(), name: '', unit: 'g', price: 0, volume: '', usage: '' };
        products.push(newProduct);
        editingProductId = newProduct.id;
        calculateTotal();
        const newRowInput = tableBody.querySelector(`[data-row-id="${newProduct.id}"] input[data-col="name"]`);
        if (newRowInput) {
            newRowInput.focus();
        }
    };

    // --- PERSISTÊNCIA DE DADOS (LocalStorage) ---

    const saveState = () => {
        localStorage.setItem(GENERAL_CALCULATOR_KEY, JSON.stringify(products));
    };

    const saveSettings = () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(calculatorSettings));
    };

    const loadSettings = () => {
        const savedSettings = localStorage.getItem(SETTINGS_KEY);
        if (savedSettings) {
            calculatorSettings = JSON.parse(savedSettings);
            extraTaxInput.value = (calculatorSettings.extraTax * 100).toFixed(2).replace('.', ',');
        }
    };

    const loadState = () => {
        const savedState = localStorage.getItem(GENERAL_CALCULATOR_KEY);
        // CORREÇÃO: Reseta o array de produtos antes de carregar um novo estado.
        // Isso impede que os produtos do "Simulado" sejam mantidos ao trocar para um novo serviço.
        products = [];
        tableBody.innerHTML = ''; // Limpa a tabela antes de carregar
        if (savedState) {
            const savedProducts = JSON.parse(savedState);
            // Garante que todos os produtos tenham um ID
            products = savedProducts.map(p => p.id ? p : { ...p, id: crypto.randomUUID() });

            if (products.length === 0) {
                // Se não houver produtos salvos, adiciona 5 linhas vazias como na planilha
                for (let i = 0; i < 5; i++) {
                    products.push({ id: crypto.randomUUID(), name: '', unit: 'g', price: 0, volume: '', usage: '' });
                }
            }
        } else {
            // Se for o primeiro acesso, adiciona 5 linhas vazias
            for (let i = 0; i < 5; i++) {
                products.push({ id: crypto.randomUUID(), name: '', unit: 'g', price: 0, volume: '', usage: '' });
            }
        }
        calculateTotal();
    };

    // --- MANIPULADORES DE EVENTOS ---

    addProductBtn.addEventListener('click', addRow);

    clearAllBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar todos os produtos dessa calculadora?')) {
            products = [];
            editingProductId = null;
            // Adiciona uma linha em branco para recomeçar
            addRow();
            calculateTotal(); // Recalcula e salva o estado final
        }
    });

    copyTotalBtn.addEventListener('click', () => {
        const totalValueText = totalDoseCostEl.textContent;
        // Extrai apenas o valor numérico formatado (ex: "15,35")
        const numericValue = parseFormattedNumber(totalValueText.replace('R$', ''));
        const valueToCopy = numericValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        navigator.clipboard.writeText(valueToCopy).then(() => {
            const originalText = copyTotalBtn.innerHTML;
            copyTotalBtn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
            copyTotalBtn.classList.add('copied');

            setTimeout(() => {
                copyTotalBtn.innerHTML = originalText;
                copyTotalBtn.classList.remove('copied');
            }, 2000);
        }).catch(err => {
            console.error('Erro ao copiar valor: ', err);
            alert('Não foi possível copiar o valor.');
        });
    });

    tableBody.addEventListener('click', (e) => {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;

        const rowId = row.dataset.rowId;

        if (target.classList.contains('edit-row-btn')) {
            editingProductId = rowId;
            renderTable();
        } else if (target.classList.contains('remove-row-btn')) {
            if (confirm('Tem certeza que deseja remover este produto?')) {
                const index = products.findIndex(p => p.id === rowId);
                if (index > -1) {
                    products.splice(index, 1);
                    calculateTotal();
                }
            }
        } else if (target.classList.contains('save-row-btn')) {
            const product = products.find(p => p.id === rowId);
            if (product) {
                product.name = row.querySelector('[data-col="name"]').value;
                product.unit = row.querySelector('[data-col="unit"]').value;
                product.price = row.querySelector('[data-col="price"]').dataset.rawValue || '0';
                product.volume = row.querySelector('[data-col="volume"]').value;
                product.usage = row.querySelector('[data-col="usage"]').value;
            }
            editingProductId = null;
            calculateTotal();
        }
    });

    tableBody.addEventListener('input', (e) => {
        const input = e.target;
        const row = input.closest('tr');
        if (!row || !row.classList.contains('editing-row')) return;

        if (input.classList.contains('formatted-number-input')) {
            sanitizeNumericOnInput(e);
            const rawValue = parseFormattedNumber(input.value);
            input.dataset.rawValue = rawValue.toFixed(2);
        } else if (input.classList.contains('number-input')) {
            sanitizeNumericOnInput(e);
        }

        // Live update for calculated values
        const price = parseFormattedNumber(row.querySelector('[data-col="price"]').value);
        const volume = parseFormattedNumber(row.querySelector('[data-col="volume"]').value);
        const usage = parseFormattedNumber(row.querySelector('[data-col="usage"]').value);
        const unit = row.querySelector('[data-col="unit"]').value;

        const pricePerGram = (volume > 0) ? (price / volume) : 0;
        const doseValue = pricePerGram * usage;

        row.querySelector('.price-per-gram').textContent = pricePerGram > 0 ? formatCurrency(pricePerGram) : '-';
        row.querySelector('.dose-value').textContent = doseValue > 0 ? formatCurrency(doseValue) : '-';
        row.querySelectorAll('.unit-display').forEach(span => {
            span.textContent = unit;
        });
    });

    extraTaxInput.addEventListener('input', sanitizeNumericOnInput);
    extraTaxInput.addEventListener('change', (e) => {
        const value = parseFloat(e.target.value.replace(',', '.')) || 0;
        calculatorSettings.extraTax = value / 100;
        // Formata o valor no campo
        e.target.value = value.toFixed(2).replace('.', ',');
        saveSettings();
        calculateTotal();
    });

    // Handlers for formatted number inputs inside the table
    tableBody.addEventListener('focusin', (e) => {
        if (e.target.classList.contains('formatted-number-input')) {
            const input = e.target;
            const rawValue = input.dataset.rawValue || '0';
            input.value = rawValue.replace('.', ',');
            input.select();
        }
    });

    tableBody.addEventListener('focusout', (e) => {
        if (e.target.classList.contains('formatted-number-input')) {
            const input = e.target;
            if (input.value.trim() === '') {
                input.dataset.rawValue = '0.00';
                input.value = '';
            } else {
                const rawValue = parseFormattedNumber(input.value);
                input.value = formatNumberForDisplay(rawValue);
            }
        }
    });

    // Salva a linha ao pressionar Enter em um campo de input da tabela
    tableBody.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
            e.preventDefault(); // Impede o comportamento padrão do Enter
            const row = e.target.closest('tr.editing-row');
            if (row) {
                // Simula o clique no botão de salvar da linha
                row.querySelector('.save-row-btn')?.click();
            }
        }
    });
    // --- LÓGICA PARA POSICIONAMENTO DINÂMICO DO TOOLTIP DA TAXA EXTRA ---
    function handleExtraTaxTooltipPosition(event) {
        const tooltip = event.currentTarget; // O .info-tooltip
        const tooltipText = tooltip.querySelector('.tooltip-text');
        
        // Reseta a posição para o cálculo
        tooltipText.style.left = '';
        tooltipText.style.top = '';
        tooltipText.style.transform = '';

        const rect = tooltip.getBoundingClientRect(); // Posição do ícone 'i' na tela
        const tooltipRect = tooltipText.getBoundingClientRect(); // Dimensões do balão

        let top, left;
        const marginAbove = 10; // Espaço entre o ícone e o tooltip (reduzido)

        // Verifica se a tela está na faixa de resolução onde o zoom é aplicado (1441px a 1920px)
        if (window.matchMedia('(min-width: 1441px) and (max-width: 1920px)').matches) {
            const zoomFactor = 0.9; // Assumindo que o zoom é 90%
            // Calcula a posição considerando o zoom
            top = (rect.top / zoomFactor) - (tooltipRect.height / zoomFactor) - (marginAbove / zoomFactor);
            left = (rect.left / zoomFactor) + (rect.width / 1.6 / zoomFactor) - (tooltipRect.width / 1.6 / zoomFactor);
        } else {
            // Lógica de cálculo original, SEM correção de zoom
            top = rect.top - tooltipRect.height - marginAbove;
            left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        }

        // Define a posição final do balão
        tooltipText.style.top = `${top}px`;
        tooltipText.style.left = `${left}px`;
    }

    // Adiciona listeners para o tooltip da Taxa Extra
    const extraTaxTooltip = document.querySelector('.extra-tax-section .info-tooltip');
    if (extraTaxTooltip) {
        extraTaxTooltip.addEventListener('mouseenter', handleExtraTaxTooltipPosition);
        extraTaxTooltip.addEventListener('mouseover', handleExtraTaxTooltipPosition); // Garante o reposicionamento
    }
    // --- INICIALIZAÇÃO ---
    loadSettings();
    loadState(); // Carrega o estado geral
});