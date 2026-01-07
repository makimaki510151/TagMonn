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
     * @param {Object} move - 使用された技データ（耐性特定用）
     * @returns {Object|null} 適用された効果の内容
     */
    applyEffect: function (effect, attacker, target, damage, move) {
        if (!effect) return null;

        // 成功確率の判定
        const chance = effect.chance !== undefined ? effect.chance : 1.0;
        if (Math.random() >= chance) {
            return null;
        }

        const statNames = {
            'atk': '攻撃',
            'spd': '速度',
            'hp': '体力'
        };
        let statName = statNames[effect.stat] || effect.stat;

        // 対象の決定
        const isBuff = effect.type === 'buff';
        const subject = isBuff ? attacker : target;

        // 特殊処理: def（耐性）の場合、技の属性に基づき耐性値を直接書き換える
        if (effect.stat === 'def' && move) {
            const resId = move.res_type;
            // 現在の耐性値に倍率を掛ける（例: 0.5倍で耐性強化、1.5倍で弱体化）
            if (subject.resistances[resId] !== undefined) {
                subject.resistances[resId] *= effect.value;
            }

            // 表示用の名前解決（gameData参照はscript.js側の想定）
            if (typeof gameData !== 'undefined' && gameData.resistances) {
                const res = gameData.resistances.find(r => r.id === resId);
                statName = res ? `${res.name}耐性` : '耐性';
            } else {
                statName = '耐性';
            }
        }

        const result = {
            type: effect.type,
            stat: statName,
            value: effect.value
        };

        switch (effect.type) {
            case 'buff':
                // atk, spd の場合は battleXxx プロパティを更新
                if (effect.stat !== 'def' && effect.stat !== 'hp') {
                    const key = `battle${effect.stat.charAt(0).toUpperCase() + effect.stat.slice(1)}`;
                    attacker[key] *= effect.value;
                }
                break;
            case 'debuff':
                // atk, spd の場合は battleXxx プロパティを更新
                if (effect.stat !== 'def' && effect.stat !== 'hp') {
                    const key = `battle${effect.stat.charAt(0).toUpperCase() + effect.stat.slice(1)}`;
                    target[key] *= effect.value;
                }
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
            case 'flinch':
                const flinchChance = effect.chance || 1;
                if (Math.random() < flinchChance) {
                    target.isFlinching = true;
                    // 追加：ひるみが発生したことを知らせる
                    result.type = 'flinch_apply';
                }
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
