/**
 * オンライン・オフライン共通の対戦ロジック
 */
const BattleLogic = {
    /**
     * ダメージ計算
     * @param {Object} move - 技データ
     * @param {Object} attacker - 攻撃側キャラ
     * @param {Object} target - 防御側キャラ
     * @returns {Object} 計算結果 { damage, resMult, isHit }
     */
    calculateDamage: function (move, attacker, target) {
        // 命中判定
        const accuracy = move.accuracy !== undefined ? move.accuracy : 100;
        const isHit = Math.random() * 100 < accuracy;

        if (!isHit) {
            return { damage: 0, resMult: 1.0, isHit: false };
        }

        if (move.power <= 0) {
            return { damage: 0, resMult: 1.0, isHit: true };
        }

        const resMult = target.resistances[move.res_type] || 1.0;
        // 威力 * (攻撃力 / 80) * 耐性倍率 (オフラインの式に合わせる)
        // 耐性は値が小さいほど強い（ダメージを減らす）ため、そのまま掛ける
        const damage = Math.floor(move.power * (attacker.battleAtk / 80) * resMult);

        return {
            damage: Math.max(0, damage),
            resMult: resMult,
            isHit: true
        };
    },

    /**
     * 効果の判定と適用
     * @param {Object} effect - 効果データ
     * @param {Object} attacker - 攻撃側キャラ
     * @param {Object} target - 防御側キャラ
     * @param {number} damage - 与えたダメージ（ドレイン用）
     * @returns {Object|null} 適用された効果の内容
     */
    applyEffect: function (effect, attacker, target, damage, move) {
        if (!effect) return null;

        // 成功確率の判定 (chanceが1未満なら確率、未記載または1なら100%)
        const chance = effect.chance !== undefined ? effect.chance : 1.0;
        if (Math.random() >= chance) {
            return null;
        }

        const statNames = {
            'atk': '攻撃',
            'spd': '速度',
            'hp': 'HP'
        };
        let statName = statNames[effect.stat] || effect.stat;

        // def（耐性）の場合は、技の耐性タイプ名を取得する
        if (effect.stat === 'def' && move) {
            // gameDataはグローバルにある想定、または引数で渡す
            const res = gameData.resistances.find(r => r.id === move.res_type);
            statName = res ? `${res.name}耐性` : '耐性';
        }

        const result = {
            type: effect.type,
            stat: statName,
            value: effect.value
        };

        switch (effect.type) {
            case 'buff':
                attacker[`battle${effect.stat.charAt(0).toUpperCase() + effect.stat.slice(1)}`] *= effect.value;
                break;
            case 'debuff':
                target[`battle${effect.stat.charAt(0).toUpperCase() + effect.stat.slice(1)}`] *= effect.value;
                break;
            case 'heal':
                const healAmt = Math.floor(attacker.maxHp * effect.value);
                attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healAmt);
                result.amount = healAmt;
                break;
            case 'drain':
                const drainAmt = Math.floor(damage * effect.value);
                attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + drainAmt);
                result.amount = drainAmt;
                break;
        }

        return result;
    }
};

// Node.js環境（server.js）とブラウザ環境（script.js）の両方に対応
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BattleLogic;
} else {
    window.BattleLogic = BattleLogic;
}
