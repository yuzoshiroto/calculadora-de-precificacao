document.addEventListener('DOMContentLoaded', () => {
    const revenueInput = document.getElementById('revenue-input');

    // Elementos da Tabela de Custo Fixo
    const fixedCostTableBody = document.getElementById('fixed-cost-body');
    const addExpenseBtn = document.getElementById('add-expense-row-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const resetToDefaultBtn = document.getElementById('reset-to-default-btn');
    const copyTotalBtn = document.getElementById('copy-total-btn');
    const totalFixedCostValueEl = document.getElementById('total-cost-value');
    const totalFixedCostPercentageEl = document.getElementById('total-cost-percentage');
    const fixedExpenseCountDisplay = document.getElementById('expense-count-display');

    // Elementos da Tabela de Custo Variável
    const variableCostTableBody = document.getElementById('variable-cost-body');
    const addVariableExpenseBtn = document.getElementById('add-variable-expense-row-btn');
    const clearVariableAllBtn = document.getElementById('clear-variable-all-btn');
    const resetVariableToDefaultBtn = document.getElementById('reset-variable-to-default-btn');
    const totalVariableCostValueEl = document.getElementById('total-variable-cost-value');
    const totalVariableCostPercentageEl = document.getElementById('total-variable-cost-percentage');
    const variableExpenseCountDisplay = document.getElementById('variable-expense-count-display');

    // Estado da UI
    let editingFixedRowId = null;
    let editingVariableRowId = null;
    let fixedExpenses = [];
    let variableExpenses = [];

    const STATE_KEY = 'fixedCostCalculatorState_v2'; // Nova chave para evitar conflito com a versão antiga

    // Dados iniciais baseados na planilha estrutura_planilha_custo_fixo.json para CUSTOS FIXOS
    const INITIAL_FIXED_EXPENSES = [
        { name: "Aluguel", value: 2800 },
        { name: "Água", value: 600 },
        { name: "Luz", value: 900 },
        { name: "Internet", value: 70 },
        { name: "Telefone", value: 70 },
        { name: "Salário Recepção", value: 1200 },
        { name: "Salário Assistentes", value: 1500 },
        { name: "Encargos sobre salários", value: 720 },
        { name: "Honorários contador", value: 300 },
        { name: "Materiais de limpeza e faxina", value: 100 },
        { name: "Aluguel de máquina de cartão", value: 60 },
        { name: "Revistas", value: 50 },
        { name: "Taxa de manutenção bancária", value: 40 },
        { name: "Pró labore", value: 1500 },
        { name: "Sistema operacional de gestão do salão", value: 90 },
        { name: "Condominio", value: 100 },
        { name: "Jardinagem", value: 100 },
        { name: "Papelaria", value: 100 },
        { name: "Consertos (manutenção básica)", value: 100 },
        { name: "Lavanderia (opcional)", value: 100 },
        { name: "Copa (café, capucino, bolo, etc...)", value: 100 },
        { name: "Parcela Empréstimo/Financiamento", value: 1000 },
    ];

    // Dados iniciais para CUSTOS VARIÁVEIS
    const INITIAL_VARIABLE_EXPENSES = [
        { name: "Taxa de cartão de crédito", value: 640 }, // 2% do faturamento padrão de 32000
        { name: "Impostos", value: 1000 },
        { name: "Comissões profissionais (média)", value: 12000 },
        { name: "Produtos (serviços do salão)", value: 5400 },
    ];

    // --- FUNÇÕES DE FORMATAÇÃO E PARSE ---
    const formatCurrency = (value) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const parseFormattedNumber = (value) => parseFloat(String(value).replace(/\./g, '').replace(',', '.')) || 0;
    const formatNumberForDisplay = (value) => {
        if (value === 0) return '';
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

    // --- FUNÇÃO PARA AJUSTAR LARGURA DO INPUT DE FATURAMENTO ---
    const updateRevenueInputWidth = () => {
        // Cria um span temporário e invisível para medir o texto
        const tempSpan = document.createElement('span');
        document.body.appendChild(tempSpan);

        tempSpan.style.font = `600 1.5rem 'Poppins', sans-serif`; // Pega os estilos do input
        tempSpan.style.visibility = 'hidden';
        tempSpan.style.position = 'absolute';
        tempSpan.style.whiteSpace = 'pre'; // Garante que espaços sejam contados

        // Usa o placeholder se o campo estiver vazio, senão usa o valor
        tempSpan.textContent = revenueInput.value || revenueInput.placeholder;

        // Encontra o card pai ".detail-card"
        // const detailCard = revenueInput.closest('.detail-card');
        // if (detailCard) {
        //     // Define a largura do card pai com um respiro (padding)
        //     // O padding do card (1rem de cada lado) já dá um bom respiro.
        //     detailCard.style.width = `${tempSpan.offsetWidth + 75}px`; // 40px de respiro extra
        // }

        document.body.removeChild(tempSpan); // Remove o span temporário
    };

    // --- LÓGICA PRINCIPAL ---

    // Função genérica para calcular totais de uma tabela
    const calculateTableTotal = (tableBody, revenue) => {
        let totalCost = 0;
        const rows = tableBody.querySelectorAll('tr');
        rows.forEach(row => {
            const valueInput = row.querySelector('[data-col="value"]');
            const cost = parseFloat(valueInput.dataset.rawValue) || 0;
            const percentage = revenue > 0 ? (cost / revenue) * 100 : 0;

            row.querySelector('.cost-percentage').textContent = `${percentage.toFixed(2)}%`;
            totalCost += cost;
        });
        return totalCost;
    };

    const calculateAll = () => {
        const revenue = parseFormattedNumber(revenueInput.value) || 0;

        // Calcula para Custos Fixos
        const totalFixedCost = fixedExpenses.reduce((sum, expense) => sum + (parseFloat(expense.value) || 0), 0);
        const totalFixedPercentage = revenue > 0 ? (totalFixedCost / revenue) * 100 : 0;
        totalFixedCostValueEl.textContent = formatCurrency(totalFixedCost);
        totalFixedCostPercentageEl.textContent = `${totalFixedPercentage.toFixed(2)}%`;
        const fixedExpenseCount = fixedCostTableBody.rows.length;
        fixedExpenseCountDisplay.textContent = `${fixedExpenseCount} ${fixedExpenseCount === 1 ? 'despesa' : 'despesas'}`;

        // Calcula para Custos Variáveis
        const totalVariableCost = variableExpenses.reduce((sum, expense) => sum + (parseFloat(expense.value) || 0), 0);
        const totalVariablePercentage = revenue > 0 ? (totalVariableCost / revenue) * 100 : 0;
        totalVariableCostValueEl.textContent = formatCurrency(totalVariableCost);
        totalVariableCostPercentageEl.textContent = `${totalVariablePercentage.toFixed(2)}%`;
        const variableExpenseCount = variableCostTableBody.rows.length;
        variableExpenseCountDisplay.textContent = `${variableExpenseCount} ${variableExpenseCount === 1 ? 'despesa' : 'despesas'}`;

        // Calcula e exibe os totais gerais (Despesas e Resultado)
        const totalExpenses = totalFixedCost + totalVariableCost;
        const totalExpensesPercentage = revenue > 0 ? (totalExpenses / revenue) * 100 : 0;
        const finalResult = revenue - totalExpenses;

        document.getElementById('total-expenses-value').textContent = formatCurrency(totalExpenses);
        document.getElementById('total-expenses-percentage').textContent = `${totalExpensesPercentage.toFixed(2)}%`;
        document.getElementById('final-result-value').textContent = formatCurrency(finalResult);

        // Re-renderiza as tabelas para atualizar as porcentagens de participação
        renderTable(fixedCostTableBody, fixedExpenses, editingFixedRowId);
        renderTable(variableCostTableBody, variableExpenses, editingVariableRowId);

        saveState();
    };

    const createRow = (expense, isEditing) => {
        const row = document.createElement('tr');
        row.dataset.rowId = expense.id;
        const valueAsNumber = parseFloat(expense.value) || 0;
        const revenue = parseFormattedNumber(revenueInput.value) || 0;
        const percentage = revenue > 0 ? (valueAsNumber / revenue) * 100 : 0;

        if (isEditing) {
            row.classList.add('editing-row');
            row.innerHTML = `
                <td><input type="text" class="text-input" placeholder="Ex: Nova Despesa" value="${expense.name}" data-col="name"></td>
                <td><input type="text" class="number-input formatted-number-input" placeholder="0,00" value="${formatNumberForDisplay(valueAsNumber)}" data-col="value" data-raw-value="${valueAsNumber.toFixed(2)}"></td>
                <td class="cost-percentage">${percentage.toFixed(2)}%</td>
                <td>
                    <button class="action-btn save-row-btn" title="Salvar Alterações">✔️</button>
                    <button class="action-btn config-row-btn" title="Configurar">⚙️</button>
                </td>
            `;
        } else {
            row.innerHTML = `
                <td>${expense.name}</td>
                <td>${formatCurrency(valueAsNumber)}</td>
                <td class="cost-percentage">${percentage.toFixed(2)}%</td>
                <td>
                    <button class="action-btn edit-row-btn" title="Editar Despesa">✏️</button>
                    <button class="action-btn remove-row-btn" title="Remover Despesa">🗑️</button>
                </td>
            `;
        }

        return row;
    };

    const renderTable = (tableBody, expensesData, editingId) => {
        tableBody.innerHTML = '';
        expensesData.forEach(expense => {
            const isEditing = expense.id === editingId;
            const row = createRow(expense, isEditing);
            tableBody.appendChild(row);
        });
    };

    const addRow = (tableBody, expensesDataRef) => {
        const newExpense = { id: crypto.randomUUID(), name: '', value: 0 };
        expensesDataRef.push(newExpense);

        if (tableBody === fixedCostTableBody) {
            editingFixedRowId = newExpense.id;
            editingVariableRowId = null;
        } else {
            editingVariableRowId = newExpense.id;
            editingFixedRowId = null;
        }
        
        fullRecalculateAndRender();
        const newRowInput = tableBody.querySelector(`[data-row-id="${newExpense.id}"] input[data-col="name"]`);
        if (newRowInput) {
            newRowInput.focus();
        }
    };

    // --- PERSISTÊNCIA DE DADOS (LocalStorage) ---
    const saveState = () => {
        const state = {
            revenue: revenueInput.dataset.rawValue || '0',
            fixedExpenses: fixedExpenses,
            variableExpenses: variableExpenses,
        };
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
    };

    const loadState = () => {
        const savedState = localStorage.getItem(STATE_KEY);

        const populateData = (savedExpenses, initialExpenses) => {
            let data;
            if (savedExpenses && savedExpenses.length > 0) {
                data = savedExpenses;
            } else {
                data = initialExpenses.map(e => ({ ...e, id: crypto.randomUUID() }));
            }
            // Garantir que todos tenham ID
            return data.map(e => e.id ? e : { ...e, id: crypto.randomUUID() });
        };

        if (savedState) {
            const state = JSON.parse(savedState);
            revenueInput.dataset.rawValue = state.revenue || '32000';
            revenueInput.value = formatNumberForDisplay(parseFloat(state.revenue));

            fixedExpenses = populateData(state.fixedExpenses, INITIAL_FIXED_EXPENSES);
            variableExpenses = populateData(state.variableExpenses, INITIAL_VARIABLE_EXPENSES);
        } else {
            // Primeiro acesso, carrega valores padrão
            revenueInput.dataset.rawValue = '32000.00';
            revenueInput.value = formatNumberForDisplay(32000);
            fixedExpenses = populateData(null, INITIAL_FIXED_EXPENSES);
            variableExpenses = populateData(null, INITIAL_VARIABLE_EXPENSES);
        }
        fullRecalculateAndRender();
    };

    // --- MANIPULADORES DE EVENTOS ---
    addExpenseBtn.addEventListener('click', () => addRow(fixedCostTableBody, fixedExpenses));

    clearAllBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar todas as despesas da tabela?')) {
            fixedExpenses = [];
            addRow(fixedCostTableBody, fixedExpenses); // Adiciona uma linha em branco para recomeçar
        }
    });

    resetToDefaultBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja resetar a tabela para as despesas padrão? Todos os dados atuais serão perdidos.')) {
            fixedExpenses = INITIAL_FIXED_EXPENSES.map(e => ({ ...e, id: crypto.randomUUID() }));
            editingFixedRowId = null;
            fullRecalculateAndRender();
        }
    });

    // Eventos para a tabela de custos variáveis
    addVariableExpenseBtn.addEventListener('click', () => addRow(variableCostTableBody, variableExpenses));

    clearVariableAllBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar todas as despesas variáveis da tabela?')) {
            variableExpenses = [];
            addRow(variableCostTableBody, variableExpenses);
        }
    });

    resetVariableToDefaultBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja resetar a tabela de custos variáveis para as despesas padrão?')) {
            variableExpenses = INITIAL_VARIABLE_EXPENSES.map(e => ({ ...e, id: crypto.randomUUID() }));
            editingVariableRowId = null;
            fullRecalculateAndRender();
        }
    });

    copyTotalBtn.addEventListener('click', () => {
        // O valor mais útil para copiar é o percentual, para ser usado no dashboard principal.
        const totalValueText = totalFixedCostPercentageEl.textContent; // Ex: "34.56%"
        // Extrai o valor numérico (ex: "34.56") e substitui o ponto por vírgula.
        const valueToCopy = totalValueText.replace('%', '').trim().replace('.', ',');

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

    const handleTableClick = (e, tableBody, expensesDataRef) => {
        const target = e.target;
        const row = target.closest('tr');
        if (!row) return;

        const rowId = row.dataset.rowId;

        if (target.classList.contains('edit-row-btn')) {
            if (tableBody === fixedCostTableBody) {
                editingFixedRowId = rowId;
            } else {
                editingVariableRowId = rowId;
            }
            fullRecalculateAndRender();
        } else if (target.classList.contains('remove-row-btn')) {
            if (confirm('Tem certeza que deseja remover esta despesa?')) {
                const index = expensesDataRef.findIndex(exp => exp.id === rowId);
                if (index > -1) {
                    expensesDataRef.splice(index, 1);
                    fullRecalculateAndRender();
                }
            }
        } else if (target.classList.contains('save-row-btn')) {
            const nameInput = row.querySelector('[data-col="name"]');
            const valueInput = row.querySelector('[data-col="value"]');
            const expense = expensesDataRef.find(exp => exp.id === rowId);

            if (expense) {
                expense.name = nameInput.value;
                expense.value = parseFormattedNumber(valueInput.value);
            }

            if (tableBody === fixedCostTableBody) {
                editingFixedRowId = null;
            } else {
                editingVariableRowId = null;
            }
            fullRecalculateAndRender();
        }
    };

    fixedCostTableBody.addEventListener('click', (e) => handleTableClick(e, fixedCostTableBody, fixedExpenses));
    variableCostTableBody.addEventListener('click', (e) => handleTableClick(e, variableCostTableBody, variableExpenses));

    const handleTableInput = (e) => {
        if (e.target.classList.contains('formatted-number-input')) {
            sanitizeNumericOnInput(e);
        }
        if (e.target.tagName === 'INPUT') {
            const row = e.target.closest('tr');
            const valueInput = row.querySelector('[data-col="value"]');
            if (valueInput) {
                const rawValue = parseFormattedNumber(valueInput.value);
                valueInput.dataset.rawValue = rawValue.toFixed(2);
            }
        }
    };

    fixedCostTableBody.addEventListener('input', handleTableInput);
    variableCostTableBody.addEventListener('input', handleTableInput);

    const handleTableBlur = (e) => {
        if (e.target.classList.contains('formatted-number-input')) {
            const input = e.target;
            if (input.value.trim() === '') {
                input.dataset.rawValue = '0.00';
                input.value = '';
            } else {
                const rawValue = parseFormattedNumber(input.value);
                input.dataset.rawValue = rawValue.toFixed(2);
                input.value = formatNumberForDisplay(rawValue);
            }
        }
    };

    fixedCostTableBody.addEventListener('focusout', handleTableBlur);
    variableCostTableBody.addEventListener('focusout', handleTableBlur);

    // Listeners para o campo de faturamento
    revenueInput.addEventListener('input', updateRevenueInputWidth);
    revenueInput.addEventListener('input', sanitizeNumericOnInput);
    revenueInput.addEventListener('input', fullRecalculateAndRender);
    revenueInput.addEventListener('focus', (e) => {
        const rawValue = e.target.dataset.rawValue || '0';
        e.target.value = rawValue.replace('.', ',');
        e.target.select();
    });
    revenueInput.addEventListener('blur', (e) => {
        const rawValue = parseFormattedNumber(e.target.value) || 0;
        e.target.dataset.rawValue = rawValue.toFixed(2);
        e.target.value = formatNumberForDisplay(rawValue);
        fullRecalculateAndRender();
        updateRevenueInputWidth(); // Atualiza a largura também no blur
    });

    function fullRecalculateAndRender() {
        calculateAll();
    }

    // --- INICIALIZAÇÃO ---
    loadState();
    updateRevenueInputWidth(); // Garante a largura correta ao carregar a página
});