<!-- 用途：管理后台整体布局，并在竖屏手机端切换为抽屉菜单。 -->
<template>
    <el-container class="admin-layout">
      <el-header>
          <f-header @toggle-phone-menu="togglePhoneMenu"></f-header>
      </el-header>
      <el-container>
        <el-aside v-if="!isPhoneLayout" :width="$store.state.asideWidth">
            <f-menu></f-menu>
        </el-aside>
        <el-main class="admin-main">
            <f-tag-list></f-tag-list>
            <router-view></router-view>
        </el-main>
      </el-container>
      <el-drawer
        v-if="isPhoneLayout"
        v-model="phoneMenuVisible"
        direction="ltr"
        size="min(82vw, 320px)"
        :with-header="false"
        custom-class="phone-menu-drawer"
        append-to-body
      >
        <f-menu phone-mode @navigate="closePhoneMenu"></f-menu>
      </el-drawer>
    </el-container>
</template>
<script setup>
import FHeader from './components/FHeader.vue'
import FMenu from './components/FMenu.vue'
import FTagList from './components/FTagList.vue'
import { usePhoneStrategy } from '~/phone-strategy'

const { isPhoneLayout, phoneMenuVisible, togglePhoneMenu, closePhoneMenu } = usePhoneStrategy()
</script>
<style>

</style>
