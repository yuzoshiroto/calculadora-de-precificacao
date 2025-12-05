document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('cost-calculator-body');
    const calculatorTitle = document.getElementById('calculator-title');
    const serviceSelector = document.getElementById('service-selector');
    const addProductBtn = document.getElementById('add-product-row-btn');
    const calculatorContainer = document.querySelector('.pricing-table-container');
    const calculatorActions = document.querySelector('.calculator-actions');
    const statusLabel = document.getElementById('service-status-label');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const copyTotalBtn = document.getElementById('copy-total-btn');
    const totalDoseCostEl = document.getElementById('total-dose-cost');

    const extraTaxInput = document.getElementById('extra-tax-input');
    const GENERAL_CALCULATOR_KEY = 'productCostCalculatorState_general';
    const DASHBOARD_STATE_KEY = 'pricingAppState';
    const SETTINGS_KEY = 'productCostCalculatorSettings'; // Chave para configurações globais da calculadora
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

    // --- LÓGICA PRINCIPAL ---
    const isServiceCalculator = () => currentCalculatorKey !== GENERAL_CALCULATOR_KEY;

    const calculateRow = (row) => {
        const priceInput = row.querySelector('[data-col="price"]');
        const volumeInput = row.querySelector('[data-col="volume"]');
        const usageInput = row.querySelector('[data-col="usage"]');

        // Usa o valor do campo durante a digitação e o dataset para valores já formatados.
        const price = parseFormattedNumber(priceInput.value);
        const volume = parseFormattedNumber(volumeInput.value);
        const usage = parseFormattedNumber(usageInput.value);

        const pricePerGram = (volume > 0) ? (price / volume) : 0;
        const doseValue = pricePerGram * usage;

        row.querySelector('.price-per-gram').textContent = pricePerGram > 0 ? formatCurrency(pricePerGram) : '-';
        row.querySelector('.dose-value').textContent = doseValue > 0 ? formatCurrency(doseValue) : '-';

        return doseValue;
    };

    const calculateTotal = () => {
        let subTotal = 0;
        const rows = tableBody.querySelectorAll('tr');
        rows.forEach(row => {
            subTotal += calculateRow(row);
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

    const createRow = (product = { name: '', unit: 'g', price: '', volume: '', usage: '' }) => {
        // Verifica se esta será a primeira linha na tabela.
        // A verificação é feita antes de a nova linha ser adicionada.
        const isFirstRow = tableBody.children.length === 0;

        // Ao carregar do localStorage, 'price' já é um número (ex: "290.00").
        const priceAsNumber = parseFloat(product.price) || 0;
        const unit = product.unit || 'g';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="text-input" placeholder="${isFirstRow ? 'Ex: Shampoo' : ''}" value="${product.name}" data-col="name"></td>
            <td>
                <select class="select-input" data-col="unit">
                    <option value="g" ${unit === 'g' ? 'selected' : ''}>g</option>
                    <option value="ml" ${unit === 'ml' ? 'selected' : ''}>ml</option>
                    <option value="Unid." ${unit === 'Unid.' ? 'selected' : ''}>Unid.</option>
                </select>
            </td>
            <td><input type="text" class="number-input formatted-number-input" placeholder="${isFirstRow ? '290,00' : ''}" value="${formatNumberForDisplay(priceAsNumber)}" data-col="price" data-raw-value="${priceAsNumber.toFixed(2)}"></td>
            <td>
                <div class="input-with-unit">
                    <input type="text" class="number-input" placeholder="${isFirstRow ? '1000' : ''}" value="${product.volume}" data-col="volume">
                    <span class="unit-display">${unit}</span>
                </div>
            </td>
            <td class="price-per-gram">-</td>
            <td><div class="input-with-unit"><input type="text" class="number-input" placeholder="${isFirstRow ? '6' : ''}" value="${product.usage}" data-col="usage"><span class="unit-display">${unit}</span></div></td>
            <td class="dose-value">-</td>
            <td><button class="action-btn remove-row-btn" title="Remover Produto">🗑️</button></td>
        `;

        // Adiciona listener para restringir a entrada apenas a números e vírgula
        row.querySelectorAll('.number-input').forEach(input => {
            input.addEventListener('keydown', (e) => {
                // Permite teclas de controle (Backspace, Tab, Enter, setas, etc.), colar (Ctrl+V) e números.
                if (['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Delete', 'Home', 'End'].includes(e.key) ||
                    (e.ctrlKey && e.key.toLowerCase() === 'v') ||
                    /[0-9,]/.test(e.key)) {
                    return; // Permite a tecla
                }
                e.preventDefault(); // Bloqueia qualquer outra tecla
            });
        });

        // Listeners para formatação de número (foco e perda de foco)
        const formattedInput = row.querySelector('.formatted-number-input');
        formattedInput.addEventListener('focus', (e) => {
            const rawValue = e.target.dataset.rawValue || '0';
            // Ao focar, mostra o valor com vírgula para edição
            e.target.value = rawValue.replace('.', ',');
            e.target.select();
        });

        formattedInput.addEventListener('blur', (e) => {
            if (e.target.value.trim() === '' || parseFormattedNumber(e.target.value) === 0) {
                e.target.dataset.rawValue = '0.00';
                e.target.value = ''; // Deixa vazio para o placeholder aparecer
            } else {
                const rawValue = parseFormattedNumber(e.target.value);
                e.target.dataset.rawValue = rawValue.toFixed(2);
                e.target.value = formatNumberForDisplay(rawValue);
            }
            calculateTotal(); // Recalcula após formatar
        });

        // Listener para o seletor de unidade
        const unitSelector = row.querySelector('[data-col="unit"]');
        unitSelector.addEventListener('change', (e) => {
            const newUnit = e.target.value;
            row.querySelectorAll('.unit-display').forEach(span => {
                span.textContent = newUnit;
            });
            calculateTotal(); // Salva o estado
        });
        // Adiciona listeners para cálculo automático
        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', calculateTotal);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    calculateTotal();
                    e.target.blur();
                }
            });
        });

        // Listener para o botão de remover
        row.querySelector('.remove-row-btn').addEventListener('click', () => {
            row.remove();
            updatePlaceholders(); // Garante que a nova primeira linha tenha os exemplos
            calculateTotal();
        });

        return row;
    };

    const addRow = () => {
        const newRow = createRow();
        tableBody.appendChild(newRow);
        newRow.querySelector('input[data-col="name"]').focus();
        // CORREÇÃO: Recalcula tudo para atualizar o contador e salvar o estado.
        calculateTotal();
    };

    // --- PERSISTÊNCIA DE DADOS (LocalStorage) ---

    const saveState = () => {
        const rows = Array.from(tableBody.querySelectorAll('tr'));
        const state = rows.map(row => ({
            name: row.querySelector('[data-col="name"]').value,
            unit: row.querySelector('[data-col="unit"]').value,
            price: row.querySelector('[data-col="price"]').dataset.rawValue || '0',
            volume: row.querySelector('[data-col="volume"]').value,
            usage: row.querySelector('[data-col="usage"]').value,
        }));
        localStorage.setItem(currentCalculatorKey, JSON.stringify(state));
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
        const savedState = localStorage.getItem(currentCalculatorKey);
        if (savedState) {
            // CORREÇÃO: Sempre carrega o estado salvo, mesmo que as linhas estejam vazias.
            // Isso garante que a quantidade de linhas adicionadas pelo usuário seja preservada.
            const products = JSON.parse(savedState);
            products.forEach(product => tableBody.appendChild(createRow(product)));
            if (products.length === 0) {
                // Se não houver produtos salvos, adiciona 5 linhas vazias como na planilha
                for (let i = 0; i < 5; i++) {
                    addRow();
                }
            }
        } else {
            // Se for o primeiro acesso, adiciona 5 linhas vazias
            for (let i = 0; i < 5; i++) {
                addRow();
            }
        }
        calculateTotal();
    };

    // --- MANIPULADORES DE EVENTOS ---

    addProductBtn.addEventListener('click', addRow);

    clearAllBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar todos os produtos dessa calculadora?')) {
            tableBody.innerHTML = '';

            const rowsToAdd = 1;
            // Adiciona linhas novas após limpar
            for (let i = 0; i < rowsToAdd; i++) {
                addRow();
            }            updatePlaceholders();
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

    extraTaxInput.addEventListener('change', (e) => {
        const value = parseFloat(e.target.value.replace(',', '.')) || 0;
        calculatorSettings.extraTax = value / 100;
        // Formata o valor no campo
        e.target.value = value.toFixed(2).replace('.', ',');
        saveSettings();
        calculateTotal();
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

    const updateCalculatorState = (serviceName) => {
        const dashboardState = JSON.parse(localStorage.getItem(DASHBOARD_STATE_KEY));
        const service = dashboardState?.services.find(s => s.name === serviceName);

        if (isServiceCalculator() && service) {
            const originMap = {
                salon: 'Produto do Salão',
                professional: 'Produto do Profissional',
                client: 'Produto do Cliente'
            };
            statusLabel.textContent = originMap[service.productOrigin] || '';
            statusLabel.style.display = 'inline-block';

            calculatorContainer.classList.remove('disabled-calculator');
            calculatorActions.classList.remove('disabled-calculator');
        } else {
            // Reseta para o estado "Geral"
            statusLabel.style.display = 'none';
            calculatorContainer.classList.remove('disabled-calculator');
            calculatorActions.classList.remove('disabled-calculator');
        }
    };

    serviceSelector.addEventListener('change', (e) => {
        const selectedService = e.target.value;
        const url = new URL(window.location);
        if (selectedService === 'general') {
            calculatorTitle.textContent = 'Simulado';
            currentCalculatorKey = GENERAL_CALCULATOR_KEY;
            url.searchParams.delete('service');
        } else {
            calculatorTitle.textContent = selectedService;
            currentCalculatorKey = `productCostCalculatorState_${selectedService}`;
            url.searchParams.set('service', selectedService);
        }
        history.replaceState({}, '', url); // Atualiza a URL sem criar nova entrada no histórico
        tableBody.innerHTML = '';
        loadState();
        // Garante que a seta feche ao selecionar um item
        const dropdownWrapper = calculatorTitle.parentElement;
        dropdownWrapper.classList.remove('open');
        updateCalculatorState(selectedService);
    });

    // Controla a seta do dropdown
    const dropdownWrapper = calculatorTitle.parentElement;
    serviceSelector.addEventListener('mousedown', () => {
        // Ao clicar, alterna o estado da seta.
        // O timeout garante que a ação ocorra após o comportamento padrão do navegador.
        setTimeout(() => {
            dropdownWrapper.classList.toggle('open');
        }, 0);
    });

    // Garante que a seta sempre feche quando o menu perde o foco.
    serviceSelector.addEventListener('blur', () => {
        dropdownWrapper.classList.remove('open');
    });

    const initializeSelector = () => {
        const dashboardState = JSON.parse(localStorage.getItem(DASHBOARD_STATE_KEY));
        serviceSelector.innerHTML = '<option value="general">Simulado</option>';

        if (dashboardState && dashboardState.services) {
            // Cria uma cópia e ordena os serviços em ordem alfabética
            const sortedServices = [...dashboardState.services].sort((a, b) => 
                a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
            );

            sortedServices.forEach(service => {
                const option = document.createElement('option');
                option.value = service.name;
                option.textContent = service.name;
                serviceSelector.appendChild(option);
            });
        }

        // Verifica se há um serviço na URL
        const urlParams = new URLSearchParams(window.location.search);
        const serviceFromUrl = urlParams.get('service');
        if (serviceFromUrl && Array.from(serviceSelector.options).some(opt => opt.value === serviceFromUrl)) {
            serviceSelector.value = serviceFromUrl;
            // Dispara o evento 'change' para carregar o estado correto
            serviceSelector.dispatchEvent(new Event('change'));
        }
        return !!serviceFromUrl; // Retorna true se um serviço foi carregado da URL
    };

    // Adiciona listeners para o tooltip da Taxa Extra
    const extraTaxTooltip = document.querySelector('.extra-tax-section .info-tooltip');
    if (extraTaxTooltip) {
        extraTaxTooltip.addEventListener('mouseenter', handleExtraTaxTooltipPosition);
        extraTaxTooltip.addEventListener('mouseover', handleExtraTaxTooltipPosition); // Garante o reposicionamento
    }
    // --- INICIALIZAÇÃO ---
    loadSettings();
    const wasLoadedFromUrl = initializeSelector();
    // Só carrega o estado inicial (Geral) se nenhum serviço específico foi carregado pela URL
    if (!wasLoadedFromUrl) {
        loadState();
        updateCalculatorState('general'); // Garante que o estado visual esteja correto para "Simulado"
    }
});