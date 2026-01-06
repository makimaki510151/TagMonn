/**
 * ゲームモードとデータの管理を行うモジュール
 */
const ModeManager = {
    MODES: {
        FREE: 'free',
        STORY: 'story'
    },
    currentMode: 'free',
    
    // 初期タグID (ストーリー開始時)
    INITIAL_STORY_TAGS: [101, 102, 103, 104, 105, 106],

    init: function() {
        this.currentMode = localStorage.getItem('tm_current_mode') || this.MODES.FREE;
        this.ensureInitialData();
    },

    setMode: function(mode) {
        this.currentMode = mode;
        localStorage.setItem('tm_current_mode', mode);
    },

    ensureInitialData: function() {
        if (!localStorage.getItem('tm_story_progress')) {
            localStorage.setItem('tm_story_progress', JSON.stringify({
                clearedStages: [],
                unlockedTags: [...this.INITIAL_STORY_TAGS]
            }));
        }
        if (!localStorage.getItem('tm_free_chars')) localStorage.setItem('tm_free_chars', '[]');
        if (!localStorage.getItem('tm_free_parties')) localStorage.setItem('tm_free_parties', '[]');
        if (!localStorage.getItem('tm_story_chars')) localStorage.setItem('tm_story_chars', '[]');
        if (!localStorage.getItem('tm_story_parties')) localStorage.setItem('tm_story_parties', '[]');
    },

    getUnlockedTags: function() {
        if (this.currentMode === this.MODES.FREE) {
            // フリーモードは全開放
            return gameData.tags.map(t => t.id);
        } else {
            const progress = JSON.parse(localStorage.getItem('tm_story_progress'));
            return progress.unlockedTags;
        }
    },

    getChars: function() {
        const freeChars = JSON.parse(localStorage.getItem('tm_free_chars') || '[]');
        const storyChars = JSON.parse(localStorage.getItem('tm_story_chars') || '[]');
        
        if (this.currentMode === this.MODES.FREE) {
            // フリーモードでは両方使える（ストーリーで作ったものも含む）
            return [...freeChars, ...storyChars.map(c => ({...c, isStoryOrigin: true}))];
        } else {
            // ストーリーモードではストーリー専用のみ
            return storyChars;
        }
    },

    getParties: function() {
        const freeParties = JSON.parse(localStorage.getItem('tm_free_parties') || '[]');
        const storyParties = JSON.parse(localStorage.getItem('tm_story_parties') || '[]');
        
        if (this.currentMode === this.MODES.FREE) {
            return [...freeParties, ...storyParties.map(p => ({...p, isStoryOrigin: true}))];
        } else {
            return storyParties;
        }
    },

    saveCharacter: function(char) {
        const key = this.currentMode === this.MODES.FREE ? 'tm_free_chars' : 'tm_story_chars';
        const chars = JSON.parse(localStorage.getItem(key) || '[]');
        chars.push(char);
        localStorage.setItem(key, JSON.stringify(chars));
    },

    saveParty: function(party) {
        const key = this.currentMode === this.MODES.FREE ? 'tm_free_parties' : 'tm_story_parties';
        const parties = JSON.parse(localStorage.getItem(key) || '[]');
        parties.push(party);
        localStorage.setItem(key, JSON.stringify(parties));
    },

    unlockTag: function(tagId) {
        const progress = JSON.parse(localStorage.getItem('tm_story_progress'));
        if (!progress.unlockedTags.includes(tagId)) {
            progress.unlockedTags.push(tagId);
            localStorage.setItem('tm_story_progress', JSON.stringify(progress));
            return true;
        }
        return false;
    },

    clearStage: function(stageId) {
        const progress = JSON.parse(localStorage.getItem('tm_story_progress'));
        if (!progress.clearedStages.includes(stageId)) {
            progress.clearedStages.push(stageId);
            localStorage.setItem('tm_story_progress', JSON.stringify(progress));
        }
    }
};
