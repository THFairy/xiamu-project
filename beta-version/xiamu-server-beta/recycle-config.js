const normalizePricingRule = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
};

const buildSelectedOptionTexts = (optionGroups, selectedValues) => {
  return optionGroups.reduce((result, group) => {
    const selectedValue = selectedValues[group.key];
    const matchedOption = group.options.find((option) => option.value === selectedValue);
    if (matchedOption) {
      result[group.key] = matchedOption.label;
    }
    return result;
  }, {});
};

const buildOptionSummary = (optionGroups, selectedValues) => {
  return optionGroups
    .map((group) => {
      const selectedValue = selectedValues[group.key];
      const matchedOption = group.options.find((option) => option.value === selectedValue);
      return matchedOption ? matchedOption.label : '';
    })
    .filter(Boolean)
    .slice(0, 2)
    .join(' / ');
};

const buildRecycleQuote = ({ product, optionGroups, selectedValues }) => {
  const pricingRule = normalizePricingRule(product.pricingRuleJson);

  if (product.quoteMode === 'manual') {
    return {
      supported: false,
      baseLabel: String(pricingRule.baseLabel || product.title || ''),
      basePrice: 0,
      maxRecyclePrice: Number(product.maxRecyclePrice || 0),
      accessoryDeduction: 0,
      issueDeduction: 0,
      finalPrice: 0,
      note: String(pricingRule.manualReviewNote || '当前商品需要人工估价'),
      accessoryItems: [],
      issueItems: [],
      selectedDeviceOptionTexts: buildSelectedOptionTexts(optionGroups, selectedValues),
      optionSummary: buildOptionSummary(optionGroups, selectedValues),
    };
  }

  const accessoryItems = [];
  const issueItems = [];

  for (const group of optionGroups) {
    const selectedValue = String(selectedValues[group.key] || '').trim();
    const matchedOption = group.options.find((option) => option.value === selectedValue);

    if (!matchedOption) {
      if (group.required) {
        return {
          supported: false,
          baseLabel: String(pricingRule.baseLabel || product.title || ''),
          basePrice: Number(pricingRule.basePrice || product.maxRecyclePrice || 0),
          maxRecyclePrice: Number(product.maxRecyclePrice || 0),
          accessoryDeduction: 0,
          issueDeduction: 0,
          finalPrice: 0,
          note: `请先选择${group.label}`,
          accessoryItems: [],
          issueItems: [],
          selectedDeviceOptionTexts: buildSelectedOptionTexts(optionGroups, selectedValues),
          optionSummary: buildOptionSummary(optionGroups, selectedValues),
        };
      }
      continue;
    }

    if (matchedOption.effectType === 'block') {
      return {
        supported: false,
        baseLabel: String(pricingRule.baseLabel || product.title || ''),
        basePrice: Number(pricingRule.basePrice || product.maxRecyclePrice || 0),
        maxRecyclePrice: Number(product.maxRecyclePrice || 0),
        accessoryDeduction: 0,
        issueDeduction: 0,
        finalPrice: 0,
        note: String(matchedOption.noteText || `${group.label}当前不支持回收`),
        accessoryItems: [],
        issueItems: [],
        selectedDeviceOptionTexts: buildSelectedOptionTexts(optionGroups, selectedValues),
        optionSummary: buildOptionSummary(optionGroups, selectedValues),
      };
    }

    const effectType = String(matchedOption.effectType || matchedOption.effect_type || '').trim();
    const priceDelta = Number(matchedOption.priceDelta ?? matchedOption.price_delta ?? 0);
    if (priceDelta > 0) {
      const deductionItem = {
        label: matchedOption.label,
        amount: priceDelta,
      };
      if (effectType === 'issue') {
        issueItems.push(deductionItem);
      } else {
        accessoryItems.push(deductionItem);
      }
    }
  }

  const basePrice = Number(pricingRule.basePrice || product.maxRecyclePrice || 0);
  const accessoryDeduction = accessoryItems.reduce((sum, item) => sum + item.amount, 0);
  const issueDeduction = issueItems.reduce((sum, item) => sum + item.amount, 0);
  const finalPrice = Math.max(basePrice - accessoryDeduction - issueDeduction, 0);

  return {
    supported: true,
    baseLabel: String(pricingRule.baseLabel || product.title || ''),
    basePrice,
    maxRecyclePrice: Number(product.maxRecyclePrice || basePrice || 0),
    accessoryDeduction,
    issueDeduction,
    finalPrice,
    note: String(pricingRule.note || '已按当前规则完成估价'),
    accessoryItems,
    issueItems,
    selectedDeviceOptionTexts: buildSelectedOptionTexts(optionGroups, selectedValues),
    optionSummary: buildOptionSummary(optionGroups, selectedValues),
  };
};

module.exports = {
  buildRecycleQuote,
};
