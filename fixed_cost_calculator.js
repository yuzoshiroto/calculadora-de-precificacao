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
        const revenue = parseFloat(revenueInput.dataset.rawValue) || 0;

        // Calcula para Custos Fixos
        const totalFixedCost = calculateTableTotal(fixedCostTableBody, revenue);
        const totalFixedPercentage = revenue > 0 ? (totalFixedCost / revenue) * 100 : 0;
        totalFixedCostValueEl.textContent = formatCurrency(totalFixedCost);
        totalFixedCostPercentageEl.textContent = `${totalFixedPercentage.toFixed(2)}%`;
        const fixedExpenseCount = fixedCostTableBody.rows.length;
        fixedExpenseCountDisplay.textContent = `${fixedExpenseCount} ${fixedExpenseCount === 1 ? 'despesa' : 'despesas'}`;

        // Calcula para Custos Variáveis
        const totalVariableCost = calculateTableTotal(variableCostTableBody, revenue);
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
        saveState();
    };

    const createRow = (expense = { name: '', value: 0 }, onRemoveCallback) => {
        const row = document.createElement('tr');
        const valueAsNumber = parseFloat(expense.value) || 0;

        row.innerHTML = `
            <td><input type="text" class="text-input" placeholder="Ex: Nova Despesa" value="${expense.name}" data-col="name"></td>
            <td><input type="text" class="number-input formatted-number-input" placeholder="0,00" value="${formatNumberForDisplay(valueAsNumber)}" data-col="value" data-raw-value="${valueAsNumber.toFixed(2)}"></td>
            <td class="cost-percentage">0,00%</td>
            <td><button class="action-btn remove-row-btn" title="Remover Despesa">🗑️</button></td>
        `;

        // Listeners para inputs
        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', calculateAll);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    calculateAll();
                    e.target.blur();
                }
            });
        });

        // Listeners de formatação
        const formattedInput = row.querySelector('.formatted-number-input');

        // Restringe a entrada apenas para números e vírgula
        formattedInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9,]/g, '');
        });

        formattedInput.addEventListener('focus', (e) => {
            const rawValue = e.target.dataset.rawValue || '0';
            if (parseFloat(rawValue) === 0) {
                e.target.value = '';
            } else {
                e.target.value = rawValue.replace('.', ',');
            }
            e.target.select();
        });
        formattedInput.addEventListener('blur', (e) => {
            if (e.target.value.trim() === '') {
                e.target.dataset.rawValue = '0.00';
                e.target.value = '';
            } else {
                const rawValue = parseFormattedNumber(e.target.value);
                e.target.dataset.rawValue = rawValue.toFixed(2);
                e.target.value = formatNumberForDisplay(rawValue);
            }
            calculateAll();
        });

        // Listener para remover
        row.querySelector('.remove-row-btn').addEventListener('click', () => {
            row.remove();
            if (onRemoveCallback) onRemoveCallback();
            calculateAll(); // Sempre recalcula tudo
        });

        return row;
    };

    const addRow = (tableBody, expense, onRemoveCallback) => {
        const newRow = createRow(expense, onRemoveCallback);
        tableBody.appendChild(newRow);
        if (!expense) {
            newRow.querySelector('input[data-col="name"]').focus();
        }
        calculateAll(); // Recalcula tudo para atualizar contadores e totais
        return newRow;
    };

    // --- PERSISTÊNCIA DE DADOS (LocalStorage) ---
    const saveState = () => {
        const getExpensesFromTable = (tableBody) => Array.from(tableBody.querySelectorAll('tr')).map(row => ({
            name: row.querySelector('[data-col="name"]').value,
            value: row.querySelector('[data-col="value"]').dataset.rawValue || '0',
        }));

        const state = {
            revenue: revenueInput.dataset.rawValue || '0',
            fixedExpenses: getExpensesFromTable(fixedCostTableBody),
            variableExpenses: getExpensesFromTable(variableCostTableBody),
        };
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
    };

    const loadState = () => {
        const savedState = localStorage.getItem(STATE_KEY);

        const populateTable = (tableBody, savedExpenses, initialExpenses) => {
            tableBody.innerHTML = '';
            if (savedExpenses && savedExpenses.length > 0) {
                savedExpenses.forEach(expense => addRow(tableBody, expense));
            } else {
                initialExpenses.forEach(expense => addRow(tableBody, expense));
            }
        };

        if (savedState) {
            const state = JSON.parse(savedState);
            revenueInput.dataset.rawValue = state.revenue || '32000';
            revenueInput.value = formatNumberForDisplay(parseFloat(state.revenue));

            populateTable(fixedCostTableBody, state.fixedExpenses, INITIAL_FIXED_EXPENSES);
            populateTable(variableCostTableBody, state.variableExpenses, INITIAL_VARIABLE_EXPENSES);
        } else {
            // Primeiro acesso, carrega valores padrão
            revenueInput.dataset.rawValue = '32000.00';
            revenueInput.value = formatNumberForDisplay(32000);
            populateTable(fixedCostTableBody, null, INITIAL_FIXED_EXPENSES);
            populateTable(variableCostTableBody, null, INITIAL_VARIABLE_EXPENSES);
        }
        calculateAll();
    };

    // --- MANIPULADORES DE EVENTOS ---
    addExpenseBtn.addEventListener('click', () => addRow(fixedCostTableBody));

    clearAllBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar todas as despesas da tabela?')) {
            fixedCostTableBody.innerHTML = '';
            addRow(fixedCostTableBody); // Adiciona uma linha em branco para recomeçar
            calculateAll();
        }
    });

    resetToDefaultBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja resetar a tabela para as despesas padrão? Todos os dados atuais serão perdidos.')) {
            fixedCostTableBody.innerHTML = '';
            INITIAL_FIXED_EXPENSES.forEach(expense => addRow(fixedCostTableBody, expense));
            calculateAll();
        }
    });

    // Eventos para a tabela de custos variáveis
    addVariableExpenseBtn.addEventListener('click', () => addRow(variableCostTableBody));

    clearVariableAllBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar todas as despesas variáveis da tabela?')) {
            variableCostTableBody.innerHTML = '';
            addRow(variableCostTableBody);
            calculateAll();
        }
    });

    resetVariableToDefaultBtn.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja resetar a tabela de custos variáveis para as despesas padrão?')) {
            variableCostTableBody.innerHTML = '';
            INITIAL_VARIABLE_EXPENSES.forEach(expense => addRow(variableCostTableBody, expense));
            calculateAll();
        }
    });

    copyTotalBtn.addEventListener('click', () => {
        // O valor mais útil para copiar é o percentual, para ser usado no dashboard principal.
        const totalValueText = totalCostPercentageEl.textContent; // Ex: "34.56%"
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


    // Listeners para o campo de faturamento
    revenueInput.addEventListener('input', updateRevenueInputWidth);
    revenueInput.addEventListener('input', calculateAll);
    revenueInput.addEventListener('focus', (e) => {
        const rawValue = e.target.dataset.rawValue || '0';
        e.target.value = rawValue.replace('.', ',');
        e.target.select();
    });
    revenueInput.addEventListener('blur', (e) => {
        const rawValue = parseFormattedNumber(e.target.value);
        e.target.dataset.rawValue = rawValue.toFixed(2);
        e.target.value = formatNumberForDisplay(rawValue);
        calculateAll();
        updateRevenueInputWidth(); // Atualiza a largura também no blur
    });

    // --- INICIALIZAÇÃO ---
    loadState();
    updateRevenueInputWidth(); // Garante a largura correta ao carregar a página
});