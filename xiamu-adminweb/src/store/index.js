import { createStore as _createStore } from 'vuex'
import { useCookies } from '@vueuse/integrations/useCookies'
import { setToken, removeToken } from '~/composables/auth'
import { filterSupportedAdminTags } from '~/composables/adminRoutes'
import { login, getinfo } from '~/api/manager'

const store = _createStore({
    state() {
        return {
            asideWidth: "250px",
            tagList: [{
                title: "后台首页",
                path: "/"
            }],
            user: {},
            menus: [],
            ruleNames: [],
            managerInfoLoaded: false,
        }
    },
    mutations: {
        handleAsideMenu(state) {
            state.asideWidth = state.asideWidth == "250px" ? "64px" : "250px"
        },
        addTag(state, { path, title }) {
            const index = state.tagList.findIndex(o => o.path == path)
            if (index == -1) {
                state.tagList.push({
                    path,
                    title
                })

                const cookies = useCookies(['tagList'])
                cookies.set("tagList", state.tagList)
            }
        },
        initTagList(state) {
            const cookies = useCookies(['tagList'])
            const tagList = cookies.get("tagList")
            if (tagList) {
                state.tagList = filterSupportedAdminTags(tagList)
                cookies.set("tagList", state.tagList)
            }
        },
        removeTag(state, path) {
            const index = state.tagList.findIndex(o => o.path == path)
            if (index != -1) {
                state.tagList.splice(index, 1)

                const cookies = useCookies(['tagList'])
                cookies.set("tagList", state.tagList)
            }
        },
        clearOtherTag(state, path) {
            state.tagList = state.tagList.filter(o => o.path == "/" || o.path == path)

            const cookies = useCookies(['tagList'])
            cookies.set("tagList", state.tagList)
        },
        clearAllTag(state) {
            state.tagList = [{
                title: "后台首页",
                path: "/"
            }]

            const cookies = useCookies(['tagList'])
            cookies.set("tagList", state.tagList)
        },
        SET_USERINFO(state, user) {
            state.user = user
        },
        SET_MENUS(state, menus) {
            state.menus = menus
        },
        SET_RULENAMES(state, ruleNames) {
            state.ruleNames = ruleNames
        },
        SET_MANAGER_INFO_LOADED(state, loaded) {
            state.managerInfoLoaded = !!loaded
        },
    },
    actions: {
        login({ commit }, { username, password }) {
            return login(username, password).then(res => {
                setToken(res.token)

                commit('SET_USERINFO', {
                    id: res.id,
                    username: res.username,
                    nickname: res.nickname,
                    account: res.account,
                    avatar: res.avatar,
                    name: res.name,
                    phone: res.phone,
                    email: res.email,
                    permission: res.permission,
                    lastLoginAt: res.lastLoginAt,
                    lastLoginAtRealtime: res.lastLoginAtRealtime,
                })
                commit('SET_MENUS', Array.isArray(res.menus) ? res.menus : [])
                commit('SET_RULENAMES', Array.isArray(res.ruleNames) ? res.ruleNames : [])
                commit('SET_MANAGER_INFO_LOADED', true)

                return res
            })
        },
        getInfo({ commit }) {
            return getinfo().then(res => {
                commit('SET_USERINFO', res)
                commit('SET_MENUS', Array.isArray(res.menus) ? res.menus : [])
                commit('SET_RULENAMES', Array.isArray(res.ruleNames) ? res.ruleNames : [])
                commit('SET_MANAGER_INFO_LOADED', true)
                return res
            })
        },
        logout({ commit }) {
            return new Promise((resolve) => {
                removeToken()
                commit('SET_USERINFO', {})
                commit('SET_MENUS', [])
                commit('SET_RULENAMES', [])
                commit('SET_MANAGER_INFO_LOADED', false)
                commit("clearAllTag")
                resolve()
            })
        },
    }
})

export default store
