document.addEventListener('DOMContentLoaded', () => {

    // --- ESTADO INICIAL DA APLICAÇÃO (Dados da Planilha) ---
    const INITIAL_STATE = {
        parameters: {
            desiredProfit: 0.10, // C10
            marketing: 0.02, // C11
            cardFee: 0.03, // C12
            tax: 0.048, // C13
            fixedCost: 0.30, // C14
            isSalaoParceiro: false // NOVO: Parâmetro global para Lei do Salão Parceiro
        },
        services: []
    };

    const DEFAULT_SORT = {
        by: 'name', dir: 'asc' // A ordem padrão agora é A-Z por nome
    };
    let appState = {}; // O estado principal da aplicação
    let editingServiceId = null; // Rastreia o ID do serviço que está sendo editado
    let breakdownChart;
    
    // --- FUNÇÕES DE LÓGICA DE CÁLCULO (O CORAÇÃO DA PLANILHA) ---
    
    // Calcula o total de custos fixos percentuais
    function getTotalFixedCostsPercent(params) {
        // Equivalente à célula C18 da aba Parâmetros
        return params.marketing + params.cardFee + params.tax + params.fixedCost;
    }

    // Calcula todas as métricas para um único serviço
    function calculateServiceMetrics(service, params) {
        // Garante que productOrigin exista para serviços antigos
        const productOrigin = service.productOrigin || 'salon';
        const realProductCost = service.productCost || 0;
        let effectiveProductCostForProfit = realProductCost;
        let commissionBase = service.currentPrice; // Base para cálculo da comissão
        let profitBase = service.currentPrice; // Base para cálculo do lucro

        if (productOrigin === 'salon') {
            // Para "Produto do Salão", o custo do produto abate a base da comissão.
            // O custo do produto continua sendo do salão para o cálculo do lucro.
            effectiveProductCostForProfit = realProductCost;
        } else if (productOrigin === 'professional') {
            effectiveProductCostForProfit = 0; // Custo para o lucro do salão é zero. (Product cost is borne by professional)
        } else if (productOrigin === 'client') {
            // Para "Produto do Cliente", o custo do produto abate a base da comissão.
            // O custo do produto também não é considerado um custo para o cálculo do lucro do salão,
            // já que o cliente pagou por ele.
            commissionBase = service.currentPrice - realProductCost;
            effectiveProductCostForProfit = 0;
        }
        
        // Coluna E: Valor Comissão - Agora considera se a taxa é percentual ou fixa
        const adminFeeValue = service.adminFeeType === 'real'
            ? (service.adminFee || 0)
            : commissionBase * (service.adminFee || 0);
        const finalCommissionBase = commissionBase - adminFeeValue;
        const commissionValue = finalCommissionBase * service.commission;
        
        // Calcula o valor do imposto com base na Lei do Salão Parceiro e no valor da comissão
        let taxValue;
        if (params.isSalaoParceiro) {
            // O imposto é aplicado sobre a receita *após* deduzir o valor da comissão.
            // Isso se aplica a todas as origens de produto quando a Lei do Salão Parceiro está ativa.
            taxValue = (service.currentPrice - commissionValue) * params.tax;
        } else {
            // O imposto é aplicado sobre o preço total atual.
            taxValue = service.currentPrice * params.tax;
        }

        // Coluna H: Lucro Financeiro = Preço - Comissão - Custo Produto - Custos Fixos - Impostos
        const marketingValue = service.currentPrice * params.marketing;
        const cardFeeValue = service.currentPrice * params.cardFee;
        const fixedCostsValue = service.currentPrice * params.fixedCost;
        const otherCostsValue = marketingValue + cardFeeValue + fixedCostsValue + taxValue;

        const financialProfit = profitBase - commissionValue - effectiveProductCostForProfit - otherCostsValue;
        
        // Coluna I: Lucro % = Lucro Financeiro / Preço Total
        const profitPercentage = service.currentPrice > 0 ? financialProfit / service.currentPrice : 0;
        
        // Coluna G: Preço Sugerido = Custo Produto / (100% - TotalCustos - LucroDesejado - Comissão)
        // A fórmula precisa considerar que a comissão não incide sobre a taxa administrativa.
        // Preço = CustoProduto + Preço * (CustosFixos + LucroDesejado) + (Preço * (1 - TaxaAdmin)) * Comissão
        const costsWithoutTax = params.marketing + params.cardFee + params.fixedCost;
        const effectiveCommissionPercent = service.adminFeeType === 'real' ? service.commission : service.commission * (1 - (service.adminFee || 0));
        const adminFeeFixed = service.adminFeeType === 'real' ? (service.adminFee || 0) : 0;

        // Porcentagem efetiva do imposto para o cálculo do preço sugerido
        // Se a Lei do Salão Parceiro estiver ativa, o imposto é aplicado sobre (P - ValorComissão).
        // Se ValorComissão = P * effectiveCommissionPercent, então Imposto = params.tax * (P - P * effectiveCommissionPercent)
        // Assim, a taxa de imposto efetiva sobre P é params.tax * (1 - effectiveCommissionPercent)
        const effectiveTaxForSuggestedPrice = params.isSalaoParceiro ? params.tax * (1 - effectiveCommissionPercent) : params.tax;
        
        let suggestedPrice = 0;
        
        if (productOrigin === 'professional') {
            // NOVA LÓGICA PARA PRODUTO DO PROFISSIONAL
            const positioningPreset = document.querySelector('input[name="positioning_preset"]:checked')?.value || 'average';
            const professionalCosts = service.professionalCosts || [];
            const validValues = professionalCosts.map(pc => pc.value).filter(v => v > 0);
            
            if (validValues.length > 0) {
                const averageCost = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
                
                if (positioningPreset === 'above_average') {
                    suggestedPrice = averageCost * 1.10;
                } else if (positioningPreset === 'below_average') {
                    suggestedPrice = averageCost * 0.90;
                } else { // 'average'
                    suggestedPrice = averageCost;
                }
            }
        } else {
            // LÓGICA ANTIGA PARA PRODUTO DO SALÃO E CLIENTE
            if (productOrigin === 'client') {
                // Lógica especial para "Produto do Cliente"
                // P = (CustoProduto * (1 - ComissãoEfetiva)) / (1 - CustosTotais% - LucroDesejado% - ComissãoEfetiva)
                const numerator = (realProductCost * (1 - effectiveCommissionPercent)) + adminFeeFixed;
                const denominator = 1 - costsWithoutTax - effectiveTaxForSuggestedPrice - params.desiredProfit - effectiveCommissionPercent;
                suggestedPrice = denominator > 0 ? numerator / denominator : 0;
            } else { // 'salon'
                // Lógica padrão para "Produto do Salão"
                const denominator = 1 - costsWithoutTax - effectiveTaxForSuggestedPrice - params.desiredProfit - effectiveCommissionPercent;
                suggestedPrice = denominator > 0 ? ((realProductCost || 0) + adminFeeFixed) / denominator : 0;
            }
        }
        return {
            ...service,
            commissionValue,
            financialProfit,
            profitPercentage,
            suggestedPrice,
            taxValue // Inclui o valor do imposto calculado
        };
    }

    // Recalcula todas as métricas para todos os serviços
    function calculateAllMetrics() {
        appState.services = appState.services.map(service => calculateServiceMetrics(service, appState.parameters));
    }

    // --- FUNÇÕES DE RENDERIZAÇÃO (ATUALIZAÇÃO DA TELA) ---
    
    function renderParameters() {
        const container = document.getElementById('financial-params');
        container.innerHTML = '';
        const paramMap = {
            desiredProfit: "Lucro Desejado",
            marketing: "Marketing",
            cardFee: "Taxa de Cartão",
            tax: "Imposto",
            fixedCost: "Custo Fixo"
        };
        // Mapeia os textos das dicas para cada parâmetro
        const tooltipMap = {
            desiredProfit: "Lucro desejado para os seus serviços. Uma margem de lucro ideal fica em torno de 10% a 20% do faturamento do salão.",
            marketing: "É recomendado um investimento de 3% a 5% do faturamento do salão.",
            cardFee: "Uma taxa de até 3% é ótimo, mas de 3% a 3,5% está ok.",
            fixedCost: "O ideal recomendado é não ultrapassar 25% a 30% do faturamento do salão."
        };

        for (const key in paramMap) {
            const item = document.createElement('div');
            item.className = 'param-item';

            // Cria o HTML do tooltip se houver um texto para a dica
            const tooltipHtml = tooltipMap[key] ? `
                <div class="info-tooltip">
                    <i class="info-icon">i</i>
                    <span class="tooltip-text">${tooltipMap[key]}</span>
                </div>` : '';

            item.innerHTML = `
                <label for="param-${key}">${paramMap[key]}</label>
                <div class="input-wrapper">
                    ${tooltipHtml}
                    <div class="input-with-symbol">
                        <input type="number" id="param-${key}" data-param="${key}" value="${formatPercentageForInput(appState.parameters[key])}" step="0.1">
                        <span>%</span>
                    </div>
                </div>
            `;
            container.appendChild(item);

            if (key === 'desiredProfit') {
                const separator = document.createElement('div');
                separator.className = 'param-separator';
                container.appendChild(separator);

                const costsTitle = document.createElement('h4');
                costsTitle.className = 'param-subtitle';
                costsTitle.textContent = 'Custos';
                container.appendChild(costsTitle);
            }
        }

        // Adiciona o container para o total de custos
        const totalContainer = document.createElement('div');
        totalContainer.className = 'param-item param-total';
        totalContainer.innerHTML = `
            <label>Custos Totais</label>
            <span id="total-costs-value">0.00%</span>
        `;
        container.appendChild(totalContainer);

        // NOVO: Adiciona o checkbox "Segue a Lei do Salão Parceiro?"
        const salaoParceiroField = document.createElement('div');
        salaoParceiroField.className = 'form-field param-checkbox-field'; // Adiciona uma classe para estilização específica
        salaoParceiroField.innerHTML = `
            <label class="checkbox-label">
                <input type="checkbox" id="global-salao-parceiro" ${appState.parameters.isSalaoParceiro ? 'checked' : ''}>
                <span>Segue a Lei do Salão Parceiro?</span>
            </label>
        `;
        container.appendChild(salaoParceiroField);

        // Adiciona o event listener para o novo checkbox global
        document.getElementById('global-salao-parceiro').addEventListener('change', (event) => {
            appState.parameters.isSalaoParceiro = event.target.checked;
            fullRecalculateAndRender();
        });

        // Adiciona listeners para os novos tooltips
        document.querySelectorAll('.param-item .info-tooltip').forEach(tooltip => {
            tooltip.addEventListener('mouseenter', handleTooltipPosition);
            tooltip.addEventListener('mouseover', handleTooltipPosition);
        });
    }
    
    function renderTable(servicesToRender) {
        let servicesToDisplay = servicesToRender || [...appState.services]; // Cria uma cópia para não alterar a ordem manual
        const table = document.querySelector('.pricing-table-container table');
        const tableBody = table.querySelector('tbody');
        const isSortActive = !!appState.sort.by;
    
        // Ordena a cópia dos serviços para exibição, a menos que já seja uma lista de busca.
        // A ordenação padrão (A-Z) será aplicada se nenhum outro filtro estiver ativo.
        const { by, dir } = appState.sort;
        if (by && dir && !servicesToRender) { // Não re-ordena se for resultado de uma busca
            servicesToDisplay.sort((a, b) => sortCallback(a, b, by, dir));
        } else if (!servicesToRender) { // Aplica a ordenação padrão se não houver filtro
            servicesToDisplay.sort((a, b) => sortCallback(a, b, DEFAULT_SORT.by, DEFAULT_SORT.dir));
        }

        updateSortIcons();
        tableBody.innerHTML = '';

        servicesToDisplay.forEach((service, index) => {
            const row = document.createElement('tr');
            row.dataset.serviceId = service.id;

            const isInEditMode = service.id === editingServiceId;
            // Lógica de cor do lucro com 3 estados:
            // - Vermelho (profit-low): Lucro negativo ou zero.
            // - Amarelo (profit-medium): Lucro positivo, mas abaixo do desejado.
            // - Verde (profit-high): Lucro igual ou acima do desejado.
            let profitClass;
            if (service.profitPercentage <= 0) {
                profitClass = 'profit-low'; // Vermelho
            } else if (service.profitPercentage < appState.parameters.desiredProfit) {
                profitClass = 'profit-medium'; // Amarelo
            } else {
                profitClass = 'profit-high'; // Verde
            }

            // Lógica de cor para o Lucro R$ (similar ao Lucro %, mas aplicada ao texto)
            const desiredProfitInRS = service.currentPrice * appState.parameters.desiredProfit;
            let profitTextClass;
            if (service.financialProfit <= 0) {
                profitTextClass = 'profit-text-low'; // Vermelho
            } else if (service.financialProfit < desiredProfitInRS) {
                profitTextClass = 'profit-text-medium'; // Amarelo
            } else {
                profitTextClass = 'profit-text-high'; // Verde
            }



            
            // --- Lógica para o texto e etiqueta do Custo de Produto ---
            const productOriginMap = {
                salon: 'Salão',
                professional: 'Profissional',
                client: 'Cliente'
            };
            const productOriginLabel = productOriginMap[service.productOrigin] || '';
            
            let displayedProductCost = formatCurrency(service.productCost); // Valor padrão
            if (service.productOrigin === 'professional') {
                displayedProductCost = '-'; // Exibe "-" se for produto do profissional
            }
            const productCostCellContent = `<span>${displayedProductCost}</span> <span class="product-origin-label">${productOriginLabel ? `(${productOriginLabel})` : ''}</span>`;

            // Lógica para o texto do Preço Sugerido
            let suggestedPriceText;
            if (service.suggestedPrice === 0 && service.productCost > 0) {
                suggestedPriceText = 'Inviável';
            } else {
                suggestedPriceText = formatCurrency(service.suggestedPrice);
            }

            // Formata a taxa administrativa para exibição
            let adminFeeDisplay;
            if (service.adminFeeType === 'real') {
                adminFeeDisplay = formatCurrency(service.adminFee || 0);
            } else {
                adminFeeDisplay = `${((service.adminFee || 0) * 100).toFixed(2)}%`;
            }

            // Prepara o valor e o placeholder para o campo de edição da taxa admin.
            let adminFeeEditValue = '';
            let adminFeeEditRawValue = '0';
            if (service.adminFee > 0) {
                if (service.adminFeeType === 'real') {
                    adminFeeEditValue = formatNumberForDisplay(service.adminFee);
                    adminFeeEditRawValue = service.adminFee.toFixed(2);
                } else { // percent
                    adminFeeEditValue = formatNumberForDisplay(service.adminFee * 100);
                    adminFeeEditRawValue = (service.adminFee * 100).toFixed(2);
                }
            }

            // Renderiza campos de input ou texto simples dependendo do modo de edição
            if (isInEditMode) {
                // Lógica para a célula de Custo de Produto no modo de edição
                let productCostEditCellContent;
                const isCurrentServiceUnviable = service.suggestedPrice === 0 && service.productCost > 0;
                if (service.productOrigin === 'professional' && !isCurrentServiceUnviable) {
                    productCostEditCellContent = `<td>- <span class="product-origin-label">(${productOriginLabel})</span></td>`; // Exibe "-" e a origem do produto
                } else {
                    productCostEditCellContent = `<td><div class="input-with-prefix"><span>R$</span><input type="text" class="product-cost-input formatted-number-input" value="${formatNumberForDisplay(service.productCost)}" data-raw-value="${service.productCost.toFixed(2)}"></div></td>`;
                }

                row.innerHTML = /*html*/`
                    <td>${service.name}</td>
                    <td>
                        <div class="input-with-prefix"><span>R$</span><input type="text" class="current-price-input formatted-number-input" value="${formatNumberForDisplay(service.currentPrice)}" data-raw-value="${service.currentPrice.toFixed(2)}"></div>
                    </td>
                    ${productCostEditCellContent}
                    <td><div class="input-with-symbol"><input type="number" class="commission-input" value="${formatPercentageForInput(service.commission)}" step="0.01"><span>%</span></div></td>
                    <td>
                        <div class="admin-fee-edit-container">
                            <input type="text" class="admin-fee-input formatted-number-input" value="${adminFeeEditValue}" data-raw-value="${adminFeeEditRawValue}">
                            <div class="unit-toggle-group-inline" data-unit-type="${service.adminFeeType}">
                                <span class="unit-toggle-inline ${service.adminFeeType === 'percent' ? 'active' : ''}" data-unit="percent">%</span>
                                <span class="unit-toggle-inline ${service.adminFeeType === 'real' ? 'active' : ''}" data-unit="real">R$</span>
                            </div>
                        </div>
                    </td>
                    <td>${formatCurrency(service.commissionValue)}</td>
                    <td class="${suggestedPriceText === 'Inviável' ? 'price-unviable' : ''}">${suggestedPriceText}</td>
                    <td class="${profitTextClass}">${formatCurrency(service.financialProfit)}</td>
                    <td><span class="profit-cell ${profitClass}">${(service.profitPercentage * 100).toFixed(2)}%</span></td>
                    <td>
                        <button class="action-btn save-service-btn" title="Salvar Alterações" data-service-id="${service.id}">✔️</button>
                        <button class="action-btn config-cost-btn" title="Configurar Custo de Produto" data-service-id="${service.id}">⚙️</button>
                    </td>
                `;
            } else {
                row.innerHTML = `
                    <td>${service.name}</td>
                    <td>${formatCurrency(service.currentPrice)}</td>
                    <td>${productCostCellContent}</td>
                    <td>${(service.commission * 100).toFixed(2)}%</td>
                    <td>${adminFeeDisplay}</td>
                    <td>${formatCurrency(service.commissionValue)}</td> 
                    <td class="${suggestedPriceText === 'Inviável' ? 'price-unviable' : ''}">${suggestedPriceText}</td>
                    <td class="${profitTextClass}">${formatCurrency(service.financialProfit)}</td>
                    <td><span class="profit-cell ${profitClass}">${(service.profitPercentage * 100).toFixed(2)}%</span></td>
                    <td>
                        <button class="action-btn edit-service-btn" data-service-id="${service.id}">✏️</button>
                        <button class="action-btn remove-service-btn" data-service-id="${service.id}">🗑️</button>
                    </td>
                `;
            }
            tableBody.appendChild(row);
        });
    }

    function renderSummaryMetrics() {
        const totalServices = appState.services.length;
        
        const totalProfitPercent = appState.services.reduce((sum, s) => sum + s.profitPercentage, 0);
        const avgProfit = totalServices > 0 ? (totalProfitPercent / totalServices) * 100 : 0;
        
        const productCosts = appState.services.map(s => s.productCost);
        const totalProductCost = productCosts.reduce((sum, cost) => sum + cost, 0);
        const avgProductCost = totalServices > 0 ? totalProductCost / totalServices : 0;
        const maxProductCost = totalServices > 0 ? Math.max(...productCosts) : 0;
        // Para o custo mínimo, ignoramos serviços com custo 0 para um dado mais realista
        const minProductCost = totalServices > 0 ? Math.min(...productCosts.filter(cost => cost > 0)) : 0;

        const totalCommissionPercent = appState.services.reduce((sum, s) => sum + s.commission, 0);
        const avgCommission = totalServices > 0 ? (totalCommissionPercent / totalServices) * 100 : 0;

        document.getElementById('total-services-metric').textContent = totalServices; // Agora é um <strong>
        document.getElementById('avg-commission-metric').textContent = `${avgCommission.toFixed(2).replace('.', ',')}%`; // Agora é um <strong>
        document.getElementById('avg-profit-metric').textContent = `${avgProfit.toFixed(2).replace('.', ',')}%`; // Agora é um <strong>
        // Adiciona as novas métricas de custo de produto
        document.getElementById('avg-product-cost-metric').textContent = formatCurrency(avgProductCost); // Agora está no card "Resumo Geral"

        // --- Lógica para o card da Lei do Salão Parceiro ---
        let totalTaxBillWithoutLaw = 0;
        let totalTaxSavings = 0;
        appState.services.forEach(service => {
            // A base de cálculo do imposto não considera o custo do produto quando é vendido ao cliente
            const priceBaseForCalculations = service.productOrigin === 'client' 
                ? service.currentPrice - service.productCost 
                : service.currentPrice;

            const taxWithoutLawForService = priceBaseForCalculations * appState.parameters.tax;
            // A economia é o valor do imposto que deixa de ser pago sobre a comissão do profissional
            const savingForService = taxWithoutLawForService * service.commission;
            
            totalTaxBillWithoutLaw += taxWithoutLawForService;
            totalTaxSavings += savingForService;
        });

        const averageSavingPercentage = totalTaxBillWithoutLaw > 0 ? (totalTaxSavings / totalTaxBillWithoutLaw) * 100 : 0;

        const salaoParceiroMetricEl = document.getElementById('salao-parceiro-metric');
        if (appState.parameters.isSalaoParceiro) {
            salaoParceiroMetricEl.innerHTML = `Considerando o todo dos serviços cadastrados, você está pagando <strong>${averageSavingPercentage.toFixed(0)}%</strong> (<strong>${formatCurrency(totalTaxSavings)}</strong>) a menos de impostos por seguir a Lei do Salão Parceiro! Ótimo trabalho!`;
            salaoParceiroMetricEl.className = 'savings-positive';
        } else {
            salaoParceiroMetricEl.innerHTML = `Sem a Lei do Salão Parceiro, considerando o todo dos serviços cadastrados, você está deixando de economizar <strong>${averageSavingPercentage.toFixed(0)}%</strong> (<strong>${formatCurrency(totalTaxSavings)}</strong>) em impostos! Recomendamos fortemente que adote esse modelo em seu salão!`;
            salaoParceiroMetricEl.className = 'savings-warning';
        }
    }

    function updateTotalCostsDisplay() {
        const totalCostsPercent = getTotalFixedCostsPercent(appState.parameters) * 100;
        const totalCostsEl = document.getElementById('total-costs-value');
        if (totalCostsEl) {
            // Usando toLocaleString para formatação localizada, se preferir
            totalCostsEl.textContent = `${totalCostsPercent.toFixed(2).replace('.', ',')}%`;
        }
    }

    // Função auxiliar para renderizar um item do breakdown (valor e percentual)
    function renderBreakdownItem(id, value, total, isOutflow = false) {
        const displayValue = isOutflow ? -Math.abs(value) : value;
        // A porcentagem deve ser sempre positiva
        const percent = total > 0 ? (Math.abs(value) / total) * 100 : 0;
        const itemEl = document.getElementById(id);
        itemEl.querySelector('.value-real').textContent = formatCurrency(displayValue);
        itemEl.querySelector('.value-percent').textContent = `(${percent.toFixed(2).replace('.', ',')}%)`;
    }

    function renderAnalysis(service) {
        const analysisSection = document.getElementById('analysis-section');
        if (!service) {
            analysisSection.style.display = 'none';
            return;
        }
        analysisSection.style.display = 'grid';

        // --- 1. Renderizar Detalhamento do Preço ---        
        document.getElementById('breakdown-title').innerHTML = `<i class="icon">🧩</i> Detalhamento do preço de ${service.name}`;        

        const chartSavingsInfoEl = document.getElementById('chart-savings-info');
        const taxValue = service.taxValue; // Usa o taxValue pré-calculado do objeto service
        const marketingValue = service.currentPrice * appState.parameters.marketing;
        const cardFeeValue = service.currentPrice * appState.parameters.cardFee;
        const fixedCostsValue = service.currentPrice * appState.parameters.fixedCost;
        const productCostValue = service.productOrigin === 'salon' ? service.productCost : 0;

        // Calcula o total de custos
        const totalCosts = service.commissionValue + marketingValue + taxValue + cardFeeValue + fixedCostsValue + productCostValue;
        
        // --- Lógica para o detalhamento do Imposto ---
        const taxItemEl = document.getElementById('breakdown-tax'); // TODO: Check if this element exists
        const taxLabelEl = taxItemEl.querySelector('.breakdown-label');
        const taxValueEl = taxItemEl.querySelector('.breakdown-value');        
        chartSavingsInfoEl.innerHTML = ''; // Limpa o container de economia por padrão

        if (appState.parameters.isSalaoParceiro) {
            const taxWithoutLaw = service.currentPrice * appState.parameters.tax; // Imposto total se a lei não fosse aplicada
            const savings = taxWithoutLaw - taxValue; // A economia é a diferença
            const percent = service.currentPrice > 0 ? (taxValue / service.currentPrice) * 100 : 0;

            // Removido o texto "(Lei do Salão Parceiro)" do label
            taxLabelEl.innerHTML = `
                <i class="icon">📜</i>
                <div class="label-with-subtitle">Impostos</div>
            `;

            taxValueEl.innerHTML = `
                <span class="value-real">
                    <span class="tax-savings-inline">(Lei do Salão Parceiro: economizado ${formatCurrency(savings)})</span>
                    ${formatCurrency(-taxValue)}
                </span>
                <span class="value-percent">(${percent.toFixed(2).replace('.', ',')}%)</span>
            `;
            // Adiciona o texto de economia no novo container abaixo do gráfico
            chartSavingsInfoEl.innerHTML = `(Lei do Salão Parceiro: economizado ${formatCurrency(savings)}`;
        } else {
            taxLabelEl.innerHTML = `
                <i class="icon">📜</i>
                <div class="label-with-subtitle">Impostos</div>
            `;
            renderBreakdownItem('breakdown-tax', taxValue, service.currentPrice, true); // Saída
        }

        renderBreakdownItem('breakdown-profit', service.financialProfit, service.currentPrice, false); // Entrada
        renderBreakdownItem('breakdown-commission', service.commissionValue, service.currentPrice, true); // Saída
        renderBreakdownItem('breakdown-marketing', marketingValue, service.currentPrice, true); // Saída
        renderBreakdownItem('breakdown-card-fee', cardFeeValue, service.currentPrice, true); // Saída
        renderBreakdownItem('breakdown-fixed-cost', fixedCostsValue, service.currentPrice, true); // Saída
        renderBreakdownItem('breakdown-product-cost', productCostValue, service.currentPrice, true); // Saída
        
        // Renderiza o novo item de Total de Custos
        renderBreakdownItem('breakdown-total-costs', totalCosts, service.currentPrice, true); // Saída
        document.getElementById('breakdown-total').textContent = formatCurrency(service.currentPrice);

        // --- Atualizar o texto no centro do gráfico ---
        const chartCenterTextEl = document.getElementById('breakdown-chart-center-text');
        chartCenterTextEl.innerHTML = `
            <span class="value">${formatCurrency(service.currentPrice)}</span>
            <span class="label">Total</span>
        `;
        // --- Atualizar o Gráfico de Breakdown ---
        const chartData = {
            labels: ['Lucro', 'Comissão', 'Marketing', 'Impostos', 'Taxa Cartão', 'Custos Fixos', 'Custo de Produto'],
            datasets: [{
                data: [
                    Math.max(0, service.financialProfit), // Lucro não pode ser negativo no gráfico
                    service.commissionValue,
                    marketingValue,
                    taxValue, // Custo
                    cardFeeValue,
                    fixedCostsValue,
                    service.productOrigin === 'salon' ? service.productCost : 0 // Custo
                ],
                backgroundColor: [
                    '#28a745', // Verde (Lucro)
                    '#ffc107', // Amarelo (Comissão)
                    '#6f42c1', // Roxo (Marketing)
                    '#fd7e14', // Laranja (Impostos)
                    '#17a2b8', // Ciano (Taxa Cartão)
                    '#a0a0a0', // Cinza claro (Custos Fixos)
                    '#dc3545'  // Vermelho (Custo Produto)
                ],
                borderColor: 'var(--bg-light)',
                borderWidth: 1,
            }]
        };

        if (breakdownChart) {
            breakdownChart.data = chartData;
            breakdownChart.update();
        } else {
            const ctx = document.getElementById('breakdown-chart').getContext('2d');
            breakdownChart = new Chart(ctx, {
                type: 'doughnut',
                data: chartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: {
                            display: false // Os labels já estão na lista ao lado
                        },
                        tooltip: {
                            zIndex: 999, // Garante que o tooltip fique na frente de outros elementos
                            callbacks: {
                                label: function(tooltipItem) {
                                    const value = tooltipItem.raw;
                                    const total = tooltipItem.dataset.data.reduce((acc, data) => acc + data, 0);
                                    const percentage = total > 0 ? (value / total) * 100 : 0;
                                    const percentageString = `(${percentage.toFixed(2).replace('.', ',')}%)`;

                                    const isOutflow = tooltipItem.dataIndex !== 0; // O primeiro item (Lucro) não é uma saída

                                    if (isOutflow) {
                                        const formattedValue = value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                        return `R$ -${formattedValue} ${percentageString}`;
                                    }
                                    return `${formatCurrency(value)} ${percentageString}`;
                                }
                            }
                        }
                    }
                }
            });
        }


        // --- 2. Gerar e Renderizar Dicas de Análise ---
        // Lógica de dicas reescrita com base nos novos parâmetros fornecidos.
        const tips = [];
        // Helper para formatação de porcentagem dentro das dicas
        function formatPercentage(value, digits) {
            return `${(value * 100).toFixed(digits)}%`;
        }

        const tipsContainer = document.getElementById('tips-content');
        tipsContainer.innerHTML = '';

        // Dica Crítica: Preço Sugerido Inviável
        const isUnviable = service.suggestedPrice === 0 && service.productCost > 0;
        if (isUnviable) {
            // Lógica inteligente para identificar os "culpados"
            const params = appState.parameters;
            const effectiveTax = params.isSalaoParceiro ? params.tax * (1 - service.commission) : params.tax;
            const effectiveCommission = service.commission * (1 - (service.adminFee || 0));

            // Parâmetros anormais
            const ABNORMAL_THRESHOLDS = {
                fixedCost: 0.35,
                commissionSalon: 0.40,
                commissionProfessional: 0.60,
                desiredProfit: 0.25,
                tax: 0.17,
                marketing: 0.10,
                cardFee: 0.05
            };

            const costComponents = [
                { name: 'Custo Fixo', value: params.fixedCost, key: 'fixedCost' },
                { name: 'Comissão', value: effectiveCommission, key: service.productOrigin === 'professional' ? 'commissionProfessional' : 'commissionSalon' },
                { name: 'Lucro Desejado', value: params.desiredProfit, key: 'desiredProfit' },
                { name: 'Imposto', value: effectiveTax, key: 'tax' },
                { name: 'Marketing', value: params.marketing, key: 'marketing' },
                { name: 'Taxa de Cartão', value: params.cardFee, key: 'cardFee' }
            ];

            // Filtra os componentes que ultrapassam seus limites anormais
            const abnormalCulprits = costComponents.filter(c => c.value > ABNORMAL_THRESHOLDS[c.key]);

            let culpritMessage;
            if (abnormalCulprits.length > 0) {
                // Se há culpados anormais, foca neles
                abnormalCulprits.sort((a, b) => b.value - a.value); // Ordena os anormais do maior para o menor
                const topCulprits = abnormalCulprits.slice(0, 3); // Pega no máximo os 3 maiores
                const culpritNames = topCulprits.map(c => `<strong>${c.name} (${formatPercentage(c.value, 1)})</strong>`).join(', ');
                
                if (topCulprits.length === 1) {
                    culpritMessage = `O principal fator é o valor elevado de ${culpritNames}, revise-o.`;
                } else {
                    culpritMessage = `Os principais fatores são os valores elevados de ${culpritNames}, revise-os.`;
                }
            } else {
                // Se ninguém está anormal, volta para a lógica antiga (pega o maior de todos)
                costComponents.sort((a, b) => b.value - a.value);
                const mainCulprit = `<strong>${costComponents[0].name} (${formatPercentage(costComponents[0].value, 1)})</strong>`;
                culpritMessage = `O principal responsável pelo valor elevado é ${mainCulprit}, revise-o.`;
            }

            tips.push({ 
                type: 'critical', 
                title: 'Preço Sugerido Inviável', 
                message: `Não é possível calcular um preço que cubra os custos e o lucro desejado, pois a soma das porcentagens ultrapassa 100%. ${culpritMessage}`
            });
        }


        // Dica sobre Lucratividade
        if (service.profitPercentage > 0.20) {
            tips.push({ type: 'success', title: 'Lucro Excelente!', message: `Com ${formatPercentage(service.profitPercentage, 1)} de lucro, este serviço é altamente rentável. Ótima configuração!` });
        } else if (service.profitPercentage >= 0.15) {
            tips.push({ type: 'success', title: 'Bom Lucro', message: `A margem de lucro de ${formatPercentage(service.profitPercentage, 1)} é boa. Continue otimizando para alcançar a excelência.`});
        } else if (service.profitPercentage >= 0.10) {
            tips.push({ type: 'info', title: 'Lucro Regular', message: `A margem de ${formatPercentage(service.profitPercentage, 1)} está no limite do ideal. Revise os custos ou o preço para melhorar a rentabilidade.`});
        } else if (service.profitPercentage >= 0.05) {
            tips.push({ type: 'warning', title: 'Baixo Lucro', message: `A margem de lucro de ${formatPercentage(service.profitPercentage, 1)} é baixa. É crucial ajustar o preço ou reduzir custos para não ter prejuízo.`});
        } else if (service.profitPercentage >= 0) {
            tips.push({ type: 'critical', title: 'Lucro Muito Baixo', message: `A margem de ${formatPercentage(service.profitPercentage, 1)} é preocupante. Este serviço corre o risco de gerar prejuízo. Requer atenção urgente!`});
        } else {
            tips.push({ type: 'critical', title: 'Lucro Negativo!', message: `Com a margem de ${formatPercentage(service.profitPercentage, 1)}, este serviço está dando prejuízo! É necessária uma revisão imediata!`});
        }

        // Dica sobre Custo de Produto
        if (service.productOrigin === 'salon') {
            const productCostRatio = service.currentPrice > 0 ? service.productCost / service.currentPrice : 0;
            if (productCostRatio > 0.20) {
                tips.push({ type: 'warning', title: 'Custo de Produto Alto', message: `O custo do produto representa ${formatPercentage(productCostRatio, 0)} do preço, o que é alto. Negocie com fornecedores ou busque alternativas.`});
            } else if (productCostRatio >= 0.15) {
                tips.push({ type: 'info', title: 'Custo de Produto Regular', message: `O custo do produto está em ${formatPercentage(productCostRatio, 0)} do preço. Se possível, tente otimizar um pouco mais o custo.`});
            } else if (productCostRatio >= 0.10) {
                tips.push({ type: 'success', title: 'Bom Custo de Produto', message: `Representando ${formatPercentage(productCostRatio, 0)} do preço, o custo do produto está bem controlado.`});
            } else {
                tips.push({ type: 'success', title: 'Custo de Produto Excelente', message: `Com um custo de apenas ${formatPercentage(productCostRatio, 0)} do preço, sua negociação com fornecedores é ótima!`});
            }
        }

        // Dica sobre Comissão
        if (service.productOrigin === 'salon') {
            if (service.commission < 0.20 || service.commission > 0.40) {
                tips.push({ type: 'info', title: 'Comissão Fora do Ideal', message: `Para produtos do salão, uma comissão entre 20% e 40% é ideal. O valor atual de ${formatPercentage(service.commission, 0)} pode ser revisto.`});
            }
        } else if (service.productOrigin === 'professional') {
            if (service.commission < 0.40 || service.commission > 0.60) {
                tips.push({ type: 'info', title: 'Comissão Fora do Ideal', message: `Para produtos do profissional, o ideal é uma comissão entre 40% e 60%. O valor atual de ${formatPercentage(service.commission, 0)} pode ser revisado.`});
            }
        }

        // Dica sobre a Lei do Salão Parceiro (específica para o serviço)
        const totalTaxWithoutLaw = service.currentPrice * appState.parameters.tax; // Imposto total se a lei não fosse aplicada
        const taxSavingValue = totalTaxWithoutLaw - service.taxValue; // A economia é a diferença
        const savingPercentage = totalTaxWithoutLaw > 0 ? (taxSavingValue / totalTaxWithoutLaw) * 100 : 0;

        if (taxSavingValue > 0) { // Só mostra a dica se houver comissão
            if (appState.parameters.isSalaoParceiro) {
                tips.push({
                    type: 'success',
                    title: 'Economia de Impostos',
                    message: `Com a Lei do Salão Parceiro aplicada, você está economizando <strong>${formatCurrency(taxSavingValue)}</strong> em impostos neste serviço, que equivale a <strong>${savingPercentage.toFixed(0)}%</strong> do imposto total. Excelente gestão!`
                });
            } else {
                // O texto da mensagem foi alterado na sua solicitação anterior, mas a lógica de adicionar a porcentagem se aplica a ambos os cenários.
                // Vou usar o texto que você me pediu para alterar na solicitação anterior.
                tips.push({
                    type: 'warning',
                    title: 'Oportunidade de Economia nos Impostos',
                    message: `Sem a Lei do Salão Parceiro, você está deixando de economizar <strong>${formatCurrency(taxSavingValue)}</strong> em impostos neste serviço, que equivale a <strong>${savingPercentage.toFixed(0)}%</strong> do imposto total. Adote a Lei do Salão Parceiro para aumentar seu lucro!`
                });
            }
        }

        // Dica sobre Preço Sugerido vs. Preço Atual
        if (service.suggestedPrice > 0 && service.suggestedPrice > service.currentPrice) {
             const difference = service.suggestedPrice - service.currentPrice;
             tips.push({ type: 'info', title: 'Potencial de Aumento na Precificação', message: `Seu preço atual está ${formatCurrency(difference)} abaixo do sugerido. Considere ajustar para ${formatCurrency(service.suggestedPrice)} para atingir seu lucro desejado.`});
        }

        // --- Dicas sobre Parâmetros Globais ---
        const { desiredProfit, marketing, cardFee, fixedCost } = appState.parameters;

        // Dica sobre Lucro Desejado Elevado
        if (desiredProfit > 0.25) {
            tips.push({
                type: 'warning',
                title: 'Lucro Desejado Elevado',
                message: `O lucro desejado definido de <strong>${formatPercentage(desiredProfit, 0)}</strong> é bastante alto para padrões de precificação, onde uma margem de lucro ideal já fica entre 10% a 20%. Tome cuidado para este parâmetro não comprometer a precificação de seus serviços.`
            });
        }

        // Dica sobre Marketing
        if (marketing < 0.03) {
            tips.push({ type: 'info', title: 'Marketing Baixo', message: `Seu investimento em marketing está em ${formatPercentage(marketing, 1)}. O ideal é entre 3% e 5% para atrair e reter mais clientes.`});
        } else if (marketing > 0.05) {
            tips.push({ type: 'warning', title: 'Marketing Alto', message: `Seu custo de marketing de ${formatPercentage(marketing, 1)} está acima do ideal (3-5%). Avalie se o retorno sobre este investimento está valendo a pena.`});
        }

        // Dica sobre Taxa de Cartão
        if (cardFee > 0.035) { // Alto
            tips.push({ type: 'warning', title: 'Taxa de Cartão Alta', message: `Sua taxa de ${formatPercentage(cardFee, 1)} é considerada alta. Tente negociar taxas melhores com sua operadora de cartão.`});
        } else if (cardFee > 0.03) { // Regular (3.1% a 3.5%)
            tips.push({ type: 'info', title: 'Taxa de Cartão Regular', message: `Sua taxa de ${formatPercentage(cardFee, 1)} está na faixa regular. Fique de olho em ofertas de outras operadoras para tentar reduzi-la.`});
        } else { // Bom (até 3%)
            tips.push({ type: 'success', title: 'Boa Taxa de Cartão', message: `Sua taxa de ${formatPercentage(cardFee, 1)} está boa. Isso ajuda a maximizar seu lucro em cada transação.`});
        }

        // Dica sobre Custo Fixo
        if (fixedCost > 0.35) {
            tips.push({ type: 'critical', title: 'Custo Fixo Crítico!', message: `Seu custo fixo de ${formatPercentage(fixedCost, 1)} é muito alto. É urgente analisar e cortar despesas operacionais não essenciais. Se não for possível, será necessário aumentar o faturamento para diluir os custos.`});
        } else if (fixedCost > 0.30) { // 30.1% a 35%
            tips.push({ type: 'warning', title: 'Custo Fixo Alto', message: `Com ${formatPercentage(fixedCost, 1)}, seu custo fixo está alto. Revise suas despesas mensais procurando mantê-lo entre 25% a 30%.`});
        } else if (fixedCost > 0.25) { // 25.1% a 30%
            tips.push({ type: 'info', title: 'Custo Fixo Regular', message: `Seu custo fixo de ${formatPercentage(fixedCost, 1)} está regular. Fique atento para que não aumente e comprometa seu lucro.`});
        } else if (fixedCost >= 0.20) { // 20% a 25%
            tips.push({ type: 'success', title: 'Custo Fixo Muito Bom', message: `Com ${formatPercentage(fixedCost, 1)}, seu custo fixo está muito bem controlado. Continue com a boa gestão.`});
        } else { // Abaixo de 20%
            tips.push({ type: 'success', title: 'Custo Fixo Excelente!', message: `Seu custo fixo de ${formatPercentage(fixedCost, 1)} está excelente, garantindo uma operação enxuta e mais lucrativa.`});
        }

        // Renderiza as dicas
        if (tips.length > 0) {
            // Mapeia a criticidade para um valor numérico para ordenação
            const criticalityOrder = {
                'critical': 0,
                'warning': 1,
                'info': 2,
                'success': 3
            };

            // Mapeia a criticidade do título para desempate
            const titleCriticality = {
                'Preço Sugerido Inviável!': 1,
                'Lucro Muito Ruim ou Negativo!': 2,
                'Custo Fixo Crítico!': 3,
                'Custo Fixo Alto': 4,
                'Lucro Baixo': 5,
                'Custo de Produto Ruim': 6,
                'Taxa de Cartão Alta': 7,
                'Marketing Alto': 7
            };

            // Ordena as dicas: primeiro por tipo (warning > info > success), depois por título
            tips.sort((a, b) => {
                const typeComparison = criticalityOrder[a.type] - criticalityOrder[b.type];
                if (typeComparison !== 0) return typeComparison;
                // Se o tipo for o mesmo (ex: dois 'warning'), usa a criticidade do título para desempatar
                const titleAValue = titleCriticality[a.title] || 99;
                const titleBValue = titleCriticality[b.title] || 99;
                return titleAValue - titleBValue;
            });

            tips.forEach(tip => {
                const tipEl = document.createElement('div');
                tipEl.className = `tip-item ${tip.type}`;
                const iconMap = {
                    success: 'fa-check-circle',
                    warning: 'fa-exclamation-triangle',
                    info: 'fa-info-circle',
                    critical: 'fa-exclamation-triangle'
                };
                tipEl.innerHTML = `
                    <div class="tip-icon"><i class="fas ${iconMap[tip.type]}"></i></div>
                    <div class="tip-text">
                        <h4>${tip.title}</h4>
                        <p>${tip.message}</p>
                    </div>
                `;
                tipsContainer.appendChild(tipEl);
            });
        } else {
            tipsContainer.innerHTML = `<div class="tip-item success"><div class="tip-icon"><i class="fas fa-check-circle"></i></div><div class="tip-text"><h4>Tudo Certo!</h4><p>Os parâmetros para este serviço parecem bem equilibrados. Continue assim!</p></div></div>`;
        }
    }

    function updateDashboard(serviceId) {
        const service = appState.services.find(s => s.id === serviceId);
        if (!service) return;

        document.getElementById('selected-service-name').textContent = service.name;
        document.getElementById('details-price').textContent = formatCurrency(service.currentPrice);
        const suggestedPriceEl = document.getElementById('details-suggested-price');
        const isUnviable = service.suggestedPrice === 0 && service.productCost > 0;
        suggestedPriceEl.textContent = isUnviable ? 'Inviável' : formatCurrency(service.suggestedPrice);
        suggestedPriceEl.classList.toggle('price-unviable', isUnviable);
        document.getElementById('details-profit-value').textContent = formatCurrency(service.financialProfit);
        document.getElementById('details-profit-percent').textContent = `${(service.profitPercentage * 100).toFixed(2)}%`;
        // Adiciona os novos valores aos novos cards
        document.getElementById('details-product-cost').textContent = formatCurrency(service.productCost);
        document.getElementById('details-commission-percent').textContent = `${(service.commission * 100).toFixed(2)}%`;        
        const adminFeeEl = document.getElementById('details-admin-fee-percent');
        if (service.adminFeeType === 'real') {
            adminFeeEl.textContent = formatCurrency(service.adminFee || 0);
        } else {
            adminFeeEl.textContent = `${((service.adminFee || 0) * 100).toFixed(2)}%`;
        }
        document.getElementById('details-commission-value').textContent = formatCurrency(service.commissionValue);

        const totalFixedCostsPercent = getTotalFixedCostsPercent(appState.parameters);
        const fixedCostsValue = service.currentPrice * totalFixedCostsPercent;
        
        // Atualiza a linha selecionada na tabela
        document.querySelectorAll('#pricing-table-body tr').forEach(row => {
            row.classList.toggle('selected', row.dataset.serviceId === serviceId);
        });

        // Renderiza as novas seções de análise
        renderAnalysis(service);

    }
    
    // --- FUNÇÕES DE MANIPULAÇÃO DE DADOS E ESTADO ---

    function saveState() {
        localStorage.setItem('pricingAppState', JSON.stringify(appState));
    }

    function loadState() {
        const savedState = localStorage.getItem('pricingAppState');
        if (savedState) {
            const state = JSON.parse(savedState);
            // Migração: Garante que serviços antigos sem ID recebam um
            if (state.services && state.services.length > 0) {
                state.services.forEach(service => {
                    if (!service.id) service.id = crypto.randomUUID();
                    // Migração: Garante que serviços antigos tenham o tipo de taxa padrão
                    if (!service.adminFeeType) service.adminFeeType = 'percent';
                });
            }
            return state;
        }
        return savedState ? JSON.parse(savedState) : JSON.parse(JSON.stringify(INITIAL_STATE)); // Deep copy
    }

    function formatCurrency(value) {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatNumberForDisplay(value) {
        return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function parseFormattedNumber(value) {
        // Remove pontos e substitui vírgula por ponto
        return parseFloat(String(value).replace(/\./g, '').replace(',', '.')) || 0;
    }

    function formatPercentageForInput(value) {
        // Arredonda para um número seguro de casas decimais para evitar problemas de ponto flutuante (ex: 0.07 * 100 = 7.000000000000001)
        const percentage = parseFloat((value * 100).toPrecision(14));

        // Se o número for inteiro, retorna sem casas decimais.
        // Caso contrário, formata para 2 casas decimais.
        if (percentage % 1 === 0) {
            return percentage;
        }
        return percentage.toFixed(2);
    }

    function sortCallback(a, b, key, dir) {
        const valA = a[key];
        const valB = b[key];

        let comparison = 0;
        if (typeof valA === 'string') {
            comparison = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base' });
        } else {
            comparison = valA - valB;
        }

        return dir === 'asc' ? comparison : -comparison;
    }
    // --- MANIPULADORES DE EVENTOS ---
    
    // Previne a digitação de caracteres inválidos (como 'e') em campos numéricos
    function handleInvalidNumberChars(event) {
        if (event.target.type === 'number' && ['e', 'E', '+', '-'].includes(event.key)) { // Para campos que ainda são type="number"
            event.preventDefault();
        }
        // Permite colar (Ctrl+V ou Cmd+V)
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
            return;
        }

        if (event.target.classList.contains('formatted-number-input') && !/[0-9,]/.test(event.key) && !['Backspace', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', '.'].includes(event.key)) {
            event.preventDefault();
        }
    }

    function handleParamChange(event) {
        const key = event.target.dataset.param;
        const value = parseFloat(event.target.value) / 100;
        if (!isNaN(value)) {
            appState.parameters[key] = value;
            fullRecalculateAndRender();
        }
    }

    function handleServiceSearch(event) {
        const searchTerm = event.target.value.toLowerCase().trim();
        const searchWrapper = event.target.parentElement;

        // Controla a visibilidade do botão de limpar
        searchWrapper.classList.toggle('has-value', searchTerm.length > 0);

        if (searchTerm) {
            const sortedServices = [...appState.services] // Cria uma cópia para não alterar a ordem original
                .map(service => {
                    const serviceName = service.name.toLowerCase();
                    let score = 0;
                    if (serviceName.startsWith(searchTerm)) {
                        score = 2; // Maior prioridade para correspondências no início
                    } else if (serviceName.includes(searchTerm)) {
                        score = 1; // Menor prioridade para correspondências no meio
                    }
                    return { ...service, score, isMatch: score > 0 };
                })
                .filter(s => s.isMatch) // Filtra apenas os que correspondem
                .sort((a, b) => b.score - a.score); // Ordena pelo score (maior primeiro)
            renderTable(sortedServices);
        } else {
            renderTable(appState.services); // Se a busca está vazia, renderiza a ordem atual
        }
    }

    function handleClearSearch() {
        const searchInput = document.getElementById('service-search-input');
        searchInput.value = '';
        // Dispara o evento de input para que a tabela seja re-renderizada
        const event = new Event('input', { bubbles: true });
        searchInput.dispatchEvent(event);
        searchInput.focus();
    }

    function handleSort(event) {
        const sortContainer = event.target.closest('.sort-icons');
        if (!sortContainer) return;

        const sortBy = sortContainer.dataset.sortBy;

        // Lógica de ordenação com 3 estados: asc -> desc -> neutro
        if (appState.sort.by === sortBy) {
            // Se já está ordenando por esta coluna, avança para o próximo estado
            if (appState.sort.dir === 'asc') {
                appState.sort.dir = 'desc'; // De 'menor para maior' para 'maior para menor'
            } else {
                appState.sort = { ...DEFAULT_SORT }; // De 'maior para menor' para o padrão (A-Z)
            }
        } else {
            // Se é uma nova coluna, começa ordenando do 'menor para maior'
            appState.sort = { by: sortBy, dir: 'asc' }; // Inicia com 'asc'
        }

        fullRecalculateAndRender();
    }

    function handleAddService() {
        const nameInput = document.getElementById('new-service-name');
        const valueInput = document.getElementById('new-service-price'); // Renomeado para clareza
        const commissionInput = document.getElementById('new-service-commission');
        const adminFeeInput = document.getElementById('new-service-admin-fee');
        const productOriginInput = document.getElementById('new-service-product-origin');
        const costInput = document.getElementById('new-service-cost');
        const professionalCostRows = document.querySelectorAll('#new-service-professional-cost-container .professional-cost-row');

        const name = nameInput.value.trim();
        const inputValue = parseFormattedNumber(valueInput.value);
        const commission = parseFloat(commissionInput.value) / 100;
        const productOrigin = productOriginInput.value;
        // O valor do custo deve ser sempre salvo, independentemente da origem.
        // A lógica de cálculo (calculateServiceMetrics) já trata o que fazer com esse valor.
        let cost = parseFormattedNumber(costInput.value);

        const adminFeeType = adminFeeInput.dataset.unitType;
        let adminFee = parseFormattedNumber(adminFeeInput.value);
        if (adminFeeType === 'percent') {
            adminFee = adminFee / 100;
        }

        let professionalCosts = [];
        if (productOrigin === 'professional') {
            cost = 0; // Zera o custo principal
            professionalCostRows.forEach(row => {
                const name = row.querySelector('.new-professional-cost-name').value.trim();
                const value = parseFormattedNumber(row.querySelector('.new-professional-cost-value').value);
                if (name || value > 0) {
                    professionalCosts.push({ name, value });
                }
            });
        }
        if (name && productOrigin && !isNaN(inputValue) && !isNaN(commission)) {
            const newService = {
                id: crypto.randomUUID(), // Adiciona um ID único
                name,
                currentPrice: inputValue,
                commission,
                productCost: cost,
                adminFeeType,
                adminFee,
                productOrigin,
                professionalCosts: productOrigin === 'professional' ? professionalCosts : [],
            };
            appState.services.push(newService);

            // Limpa os campos
            nameInput.value = '';
            valueInput.value = '';
            valueInput.dataset.rawValue = '0';
            commissionInput.value = '';
            adminFeeInput.value = ''; // Limpa o campo da taxa
            adminFeeInput.dataset.rawValue = '0';
            costInput.value = '';
            costInput.dataset.rawValue = '0';
            productOriginInput.value = '';
            // Limpa e esconde os campos de custo profissional
            professionalCostRows.forEach(row => {
                row.querySelector('.new-professional-cost-name').value = '';
                row.querySelector('.new-professional-cost-value').value = '';
            });
            document.getElementById('new-service-cost-container').style.display = 'none';
            document.getElementById('new-service-professional-cost-container').style.display = 'none';
            fullRecalculateAndRender();
        } else {
            alert('Por favor, preencha todos os campos do novo serviço corretamente.');
        }
    }

    // --- LÓGICA DO MODAL DE CUSTO DE PRODUTO ---

    function openProductCostModal(serviceId) {
        const service = appState.services.find(s => s.id === serviceId);
        if (!service) return;

        const modal = document.getElementById('product-cost-modal');
        const originSelect = document.getElementById('modal-product-origin');
        const costInput = document.getElementById('modal-product-cost');
        const calculatorBtn = document.getElementById('modal-calculator-btn');
        // Containers
        const costContainer = document.getElementById('modal-cost-container');
        const professionalCostContainer = document.getElementById('modal-professional-cost-container');

        // Armazena o ID do serviço no modal para referência
        modal.dataset.serviceId = serviceId;

        // Preenche os campos com os dados atuais do serviço
        originSelect.value = service.productOrigin || 'salon';

        // Limpa e preenche os campos de custo padrão
        costInput.value = formatNumberForDisplay(service.productCost);
        costInput.dataset.rawValue = service.productCost.toFixed(2);

        // Limpa e preenche os campos de custo profissional
        const professionalCostRows = professionalCostContainer.querySelectorAll('.professional-cost-row');
        professionalCostRows.forEach((row, index) => {
            const nameInput = row.querySelector('.modal-professional-cost-name');
            const valueInput = row.querySelector('.modal-professional-cost-value');
            const pCost = service.professionalCosts?.[index];
            nameInput.value = pCost?.name || '';
            valueInput.value = pCost?.value > 0 ? formatNumberForDisplay(pCost.value) : '';
        });

        // Define o link do botão da calculadora, passando o nome do serviço na URL
        calculatorBtn.href = `product_cost_calculator.html?service=${encodeURIComponent(service.name)}`;

        // Controla a visibilidade dos containers de custo
        // A visibilidade do botão da calculadora está atrelada ao container de custo padrão
        const selectedOrigin = originSelect.value;
        const showStandardCost = selectedOrigin === 'salon' || selectedOrigin === 'client';
        costContainer.style.display = showStandardCost ? 'flex' : 'none';
        professionalCostContainer.style.display = selectedOrigin === 'professional' ? 'block' : 'none';

        // Exibe o modal
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('open'), 10); // Para a transição de opacidade
    }

    function closeProductCostModal() {
        const modal = document.getElementById('product-cost-modal');
        modal.classList.remove('open');
        setTimeout(() => modal.style.display = 'none', 300); // Espera a transição terminar
    }

    function saveProductCostFromModal() {
        const modal = document.getElementById('product-cost-modal');
        const serviceId = modal.dataset.serviceId;
        const service = appState.services.find(s => s.id === serviceId);
        if (!service) return;

        service.productOrigin = document.getElementById('modal-product-origin').value;

        if (service.productOrigin === 'professional') {
            service.productCost = 0; // Zera o custo principal
            service.professionalCosts = [];
            const professionalCostRows = document.querySelectorAll('#modal-professional-cost-container .professional-cost-row');
            professionalCostRows.forEach(row => {
                const name = row.querySelector('.modal-professional-cost-name').value.trim();
                const value = parseFormattedNumber(row.querySelector('.modal-professional-cost-value').value);
                if (name || value > 0) {
                    service.professionalCosts.push({ name, value });
                }
            });
        } else {
            // O valor do custo do produto deve ser sempre salvo, independentemente da origem.
            // A lógica de cálculo (calculateServiceMetrics) já sabe como tratar esse valor
            service.productCost = parseFormattedNumber(document.getElementById('modal-product-cost').value);
            service.professionalCosts = []; // Limpa os custos de concorrentes
        }
        
        closeProductCostModal();
        fullRecalculateAndRender(); // Recalcula e re-renderiza tudo com os novos valores
    }

    function handleSaveService(serviceId) {
        const row = document.querySelector(`tr[data-service-id="${serviceId}"]`);
        if (!row) return;

        const priceInput = row.querySelector('.current-price-input');
        const costInput = row.querySelector('.product-cost-input');
        const commissionInput = row.querySelector('.commission-input');
        const adminFeeInput = row.querySelector('.admin-fee-input'); // Campo de valor
        const adminFeeToggleGroup = row.querySelector('.unit-toggle-group-inline'); // Grupo de seletores

        // Encontra o serviço no estado da aplicação
        const service = appState.services.find(s => s.id === serviceId);
        if (!service) return;
        // Lê os valores dos campos
        const newPrice = parseFormattedNumber(priceInput.value);
        const newCommission = parseFloat(commissionInput.value.replace(',', '.')) / 100;
        const newAdminFeeType = adminFeeToggleGroup.dataset.unitType;
        let newAdminFee = parseFormattedNumber(adminFeeInput.value);
        if (newAdminFeeType === 'percent') {
            newAdminFee = newAdminFee / 100;
        }

        // Atualiza os valores do serviço
        if (!isNaN(newCommission)) service.commission = parseFloat(newCommission.toFixed(4));
        if (!isNaN(newAdminFee)) service.adminFee = parseFloat(newAdminFee.toFixed(4));
        if (!isNaN(newPrice)) service.currentPrice = newPrice;

        // Só tenta atualizar o custo se o campo existir (não é "Produto do Profissional")
        if (costInput) {
            const newCost = parseFormattedNumber(costInput.value);
            if (!isNaN(newCost)) service.productCost = newCost;
        }

        // Atualiza o tipo da taxa
        service.adminFeeType = newAdminFeeType;

        // Sai do modo de edição e renderiza tudo
        editingServiceId = null;
        fullRecalculateAndRender();

        // Mantém o serviço recém-editado selecionado no dashboard
        updateDashboard(serviceId);
    }

    function handleRemoveService(event) {
        const serviceId = event.target.dataset.serviceId;
        const service = appState.services.find(s => s.id === serviceId);
        if (!service) return;
        const serviceName = service.name;
        if (confirm(`Tem certeza que deseja remover o serviço "${serviceName}"?`)) {
            appState.services = appState.services.filter(s => s.id !== serviceId);
            fullRecalculateAndRender();
        }
    }

    function handleInputFocus(event) {
        const input = event.target;
        if (input.classList.contains('formatted-number-input')) {
            // Pega o valor "cru" (ex: "55.00") e substitui o ponto por vírgula para edição.
            const rawValue = input.dataset.rawValue || '0';
            input.value = rawValue.replace('.', ',');
            input.select(); // Seleciona todo o texto para facilitar a substituição
        }
    }

    function handleInputBlur(event) {
        const input = event.target;
        if (input.classList.contains('formatted-number-input')) {
            if (input.value.trim() === '') {
                input.dataset.rawValue = '0';
            } else {
                const rawValue = parseFormattedNumber(input.value);
                input.dataset.rawValue = rawValue.toFixed(2);
                input.value = formatNumberForDisplay(rawValue);
            }
        }
    }

    // Função para sanitizar a entrada em campos numéricos, removendo caracteres não permitidos
    function sanitizeNumericOnInput(event) {
        const input = event.target;
        let value = input.value;
        // Permite apenas uma vírgula
        const parts = value.split(',');
        if (parts.length > 2) {
            value = parts[0] + ',' + parts.slice(1).join('');
        }
        // Remove qualquer caractere que não seja um dígito ou a vírgula
        input.value = value.replace(/[^0-9,]/g, '');
    }

    function updateSortIcons() {
        document.querySelectorAll('.sort-icons').forEach(iconSet => {
            const columnSortBy = iconSet.dataset.sortBy;
            
            // Limpa todas as classes de estado
            iconSet.classList.remove('active', 'sort-asc', 'sort-desc');

            // Se a ordenação atual corresponde a esta coluna, aplica as classes corretas
            if (appState.sort.by === columnSortBy) {
                iconSet.classList.add('active');
                iconSet.classList.add(appState.sort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });
    }

    // --- LÓGICA PARA POSICIONAMENTO DINÂMICO DO TOOLTIP ---
    function handleTooltipPosition(event) {
        const tooltip = event.currentTarget; // O .info-tooltip
        const tooltipText = tooltip.querySelector('.tooltip-text');
        
        // Reseta a posição para o cálculo
        tooltipText.style.left = '';
        tooltipText.style.top = '';
        tooltipText.style.transform = '';

        const rect = tooltip.getBoundingClientRect(); // Posição do ícone 'i' na tela
        const tooltipRect = tooltipText.getBoundingClientRect(); // Dimensões do balão

        let top, left;

        // Verifica se a tela está na faixa de resolução onde o zoom é aplicado (1441px a 1920px)
        if (window.matchMedia('(min-width: 1441px) and (max-width: 1920px)').matches) {
            // Lógica de cálculo COM correção de zoom
            const zoomFactor = 0.9;
            top = (rect.top / zoomFactor) - tooltipRect.height - 20; // 10px de espaço acima
            left = (rect.left / zoomFactor) + (rect.width / zoomFactor / 1.8) - (tooltipRect.width / 1.8);
        } else {
            // Lógica de cálculo original, SEM correção de zoom
            top = rect.top - tooltipRect.height - 10; // 10px de espaço acima
            left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        }

        // Exceção para os tooltips da sidebar, movendo-os para a esquerda
        // Este ajuste é aplicado após o cálculo base, funcionando para ambos os casos.
        if (tooltip.id === 'add-service-tooltip' || tooltip.id === 'global-params-tooltip') {
            // Desloca o balão 50 pixels para a esquerda a partir da posição centralizada
            left -= 60;
        }

        // Define a posição final do balão
        tooltipText.style.top = `${top}px`;
        tooltipText.style.left = `${left}px`;
    }

    // --- INICIALIZAÇÃO E FLUXO PRINCIPAL ---
    
    function fullRecalculateAndRender() {
        calculateAllMetrics();
        renderTable();
        renderSummaryMetrics();
        updateTotalCostsDisplay();
        
        // Mantém o dashboard atualizado com o serviço selecionado
        const selectedRow = document.querySelector('#pricing-table-body tr.selected');
        if (selectedRow) {
            updateDashboard(selectedRow.dataset.serviceId);
        } else if (appState.services.length > 0) {
            // Se nenhum estiver selecionado, seleciona o primeiro
             updateDashboard(appState.services[0].id);
        }
        
        saveState();
    }

    function handleProductPresetChange(event) {
        const presetValue = event.target.value;
        const positioningSection = document.getElementById('positioning-section');
        const newServiceProductOriginSelect = document.getElementById('new-service-product-origin');

        // Pré-seleciona o dropdown no formulário "Adicionar Serviços"
        if (newServiceProductOriginSelect) {
            newServiceProductOriginSelect.value = presetValue;
            // Dispara o evento 'change' para que qualquer lógica associada (como mostrar/ocultar o campo de custo) seja executada
            newServiceProductOriginSelect.dispatchEvent(new Event('change'));
        }

        // Mostra ou esconde a seção "Posicionamento"
        if (presetValue === 'professional') {
            positioningSection.style.display = 'block';
        } else {
            positioningSection.style.display = 'none';
        }
    }

    function init() {
        appState = loadState();
        appState.sort = appState.sort || { ...DEFAULT_SORT };

        renderParameters();
        
        // Adicionar Listeners
        // Listener global para campos numéricos
        document.addEventListener('keydown', handleInvalidNumberChars);

        document.getElementById('financial-params').addEventListener('input', handleParamChange);
        document.getElementById('pricing-table-body').addEventListener('focusin', handleInputFocus);
        document.getElementById('pricing-table-body').addEventListener('focusout', handleInputBlur);

        // Adiciona sanitização no input para campos numéricos na tabela
        document.getElementById('pricing-table-body').addEventListener('input', (e) => {
            if (e.target.classList.contains('formatted-number-input') || e.target.type === 'number') {
                sanitizeNumericOnInput(e);
            }
        });

        document.getElementById('service-manager').addEventListener('focusin', handleInputFocus);
        document.getElementById('service-manager').addEventListener('focusout', handleInputBlur);
        document.getElementById('pricing-table-body').addEventListener('click', (e) => {
            // Garante que todos os serviços tenham a propriedade productOrigin para evitar erros
            appState.services.forEach(s => {
                if (!s.hasOwnProperty('productOrigin')) {
                    s.productOrigin = 'salon';
                }
                if (!s.hasOwnProperty('adminFeeType')) {
                    s.adminFeeType = 'percent';
                }
            });
            const row = e.target.closest('tr');
            if (e.target.classList.contains('remove-service-btn')) {
                handleRemoveService(e);
            } else if (e.target.classList.contains('edit-service-btn')) {
                editingServiceId = e.target.dataset.serviceId;
                renderTable(); // Apenas re-renderiza a tabela para entrar em modo de edição
            } else if (e.target.classList.contains('save-service-btn')) {
                handleSaveService(e.target.dataset.serviceId);
            } else if (e.target.classList.contains('config-cost-btn')) {
                // NOVO: Abre o modal de configuração de custo
                openProductCostModal(e.target.dataset.serviceId);
            } else if (e.target.classList.contains('unit-toggle-inline')) {
                // NOVO: Manipula a troca de unidade da taxa admin. na tabela
                const toggleGroup = e.target.parentElement;
                const selectedUnit = e.target.dataset.unit;

                // Atualiza o estado visual e o data-attribute
                toggleGroup.dataset.unitType = selectedUnit;
                toggleGroup.querySelectorAll('.unit-toggle-inline').forEach(el => el.classList.remove('active'));
                e.target.classList.add('active');
                // Não é necessário recalcular aqui, isso será feito ao salvar.
            } else if (row) {
                updateDashboard(row.dataset.serviceId);
            }
        });
        document.getElementById('add-service-btn').addEventListener('click', handleAddService);
        document.getElementById('service-search-input').addEventListener('input', handleServiceSearch);
        document.getElementById('clear-search-btn').addEventListener('click', handleClearSearch);
        document.querySelector('thead').addEventListener('click', handleSort);
        document.getElementById('new-service-product-origin').addEventListener('change', (e) => {
            const costContainer = document.getElementById('new-service-cost-container');
            const professionalCostContainer = document.getElementById('new-service-professional-cost-container');
            const selectedOrigin = e.target.value;

            costContainer.style.display = (selectedOrigin === 'salon' || selectedOrigin === 'client') ? 'block' : 'none';
            professionalCostContainer.style.display = selectedOrigin === 'professional' ? 'block' : 'none';
        });

        // Adiciona sanitização no input para campos numéricos no formulário de adicionar serviço
        document.getElementById('service-manager').addEventListener('input', (e) => {
            if (e.target.classList.contains('formatted-number-input') || e.target.type === 'number') {
                sanitizeNumericOnInput(e);
            }
        });

        // Listener para os seletores de unidade da taxa administrativa
        document.querySelector('.toggle-label').addEventListener('click', (e) => {
            if (e.target.classList.contains('unit-toggle')) {
                const selectedUnit = e.target.dataset.unit;
                const adminFeeInput = document.getElementById('new-service-admin-fee');
                
                // Atualiza o estado visual
                document.querySelectorAll('.unit-toggle').forEach(el => el.classList.remove('active'));
                e.target.classList.add('active');

                // Atualiza o input
                adminFeeInput.dataset.unitType = selectedUnit;
                adminFeeInput.placeholder = selectedUnit === 'percent' ? 'Ex: 10,00' : 'Ex: 5,00';
                adminFeeInput.value = ''; // Limpa o valor ao trocar
                adminFeeInput.dataset.rawValue = '0';
            }
        });
        // --- Listeners do Modal ---
        const modal = document.getElementById('product-cost-modal');
        document.getElementById('modal-save-btn').addEventListener('click', saveProductCostFromModal);
        document.getElementById('modal-cancel-btn').addEventListener('click', closeProductCostModal);
        modal.addEventListener('click', (e) => { // Fecha se clicar no overlay
            if (e.target === modal) {
                closeProductCostModal();
            }
        });
        document.getElementById('modal-product-origin').addEventListener('change', (e) => {
            const costContainer = document.getElementById('modal-cost-container');
            const professionalCostContainer = document.getElementById('modal-professional-cost-container');
            const calculatorBtn = document.getElementById('modal-calculator-btn'); // Pega o botão da calculadora
            const selectedOrigin = e.target.value;

            const showStandardCost = selectedOrigin === 'salon' || selectedOrigin === 'client';
            costContainer.style.display = showStandardCost ? 'flex' : 'none';
            calculatorBtn.style.display = showStandardCost ? 'flex' : 'none'; // Controla a visibilidade do botão
            professionalCostContainer.style.display = selectedOrigin === 'professional' ? 'block' : 'none';
        });
        // Adiciona sanitização no input para o campo de custo no modal
        document.getElementById('modal-product-cost').addEventListener('input', sanitizeNumericOnInput);

        // Adiciona sanitização para os parâmetros globais
        document.getElementById('financial-params').addEventListener('input', sanitizeNumericOnInput);

        // Adiciona listeners para os tooltips
        document.querySelectorAll('.info-tooltip').forEach(tooltip => {
            tooltip.addEventListener('mouseenter', handleTooltipPosition);
            tooltip.addEventListener('mouseover', handleTooltipPosition); // Garante o reposicionamento
        });

        // Adiciona listener para o novo bloco de pré-definição
        document.getElementById('product-origin-preset').addEventListener('change', handleProductPresetChange);


        
        fullRecalculateAndRender();

        // Garante que o campo de custo comece oculto, pois a opção padrão é "Escolha uma opção..."
        document.getElementById('new-service-cost-container').style.display = 'none';
        document.getElementById('new-service-professional-cost-container').style.display = 'none';

        if (appState.services.length > 0) {
            updateDashboard(appState.services[0].id);
        }
    }

    function initSidebarToggle() {
        const sidebar = document.querySelector('.sidebar');
        const toggleBtn = document.getElementById('sidebar-toggle-btn');
        const mainContent = document.querySelector('.main-content');
        const SIDEBAR_STATE_KEY = 'sidebarCollapsed';

        if (!sidebar || !toggleBtn || !mainContent) return;

        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            const isCollapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem(SIDEBAR_STATE_KEY, isCollapsed);
        });

        // Carrega o estado salvo
        if (localStorage.getItem(SIDEBAR_STATE_KEY) === 'true') {
            sidebar.classList.add('collapsed');
        }
    }

    init();

    initSidebarToggle();
});