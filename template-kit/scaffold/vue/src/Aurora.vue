<!-- Composant de référence : formulaire d'identification puis discussion.
     `useTemplate()` fournit phase/messages/params/actions avec recalcul
     automatique des `computed` à chaque mise à jour du contexte. -->
<script setup>
import { ref } from "vue";
import { useTemplate } from "@onirtech/template-sdk/vue";

const { phase, messages, params, actions } = useTemplate();
const draft = ref("");

function submitIdentity(event) {
  const data = new FormData(event.currentTarget);
  const nom = String(data.get("nom") ?? "").trim();
  const email = String(data.get("email") ?? "").trim();
  if (nom === "" || email === "") return;
  actions.submitIdentity({
    nom,
    email,
    consentement: data.get("consentement") === "on",
  });
}

function sendMessage() {
  if (draft.value.trim() === "") return;
  actions.sendMessage(draft.value.trim());
  draft.value = "";
}
</script>

<template>
  <form v-if="phase === 'identity'" class="onirtech-identity" @submit.prevent="submitIdentity">
    <h2>{{ params.titre }}</h2>
    <label>
      Nom
      <input name="nom" type="text" placeholder="Votre nom" aria-label="Nom" required />
    </label>
    <label>
      Email
      <input
        name="email"
        type="email"
        placeholder="vous@exemple.mg"
        aria-label="Email"
        required
      />
    </label>
    <label class="check">
      <input name="consentement" type="checkbox" /> J'accepte le traitement de mes données
    </label>
    <button type="submit">Démarrer la discussion</button>
  </form>

  <section v-else class="onirtech-chat">
    <h2>{{ params.titre }}</h2>
    <ul>
      <li v-for="message in messages" :key="message.id" :class="message.role">
        <div>{{ message.content }}</div>
        <template v-for="(media, index) in message.medias ?? []" :key="index">
          <img v-if="media.type === 'photo'" :src="media.url" :alt="media.libelle" />
          <a v-else :href="media.url" target="_blank" rel="noopener noreferrer">
            {{ media.libelle }}
          </a>
        </template>
      </li>
    </ul>
    <p v-if="messages.length === 0">Bonjour !</p>
    <form class="composer" @submit.prevent="sendMessage">
      <input v-model="draft" placeholder="Votre message…" aria-label="Message" />
      <button type="submit">Envoyer</button>
    </form>
    <div class="footer">
      <button type="button" @click="actions.finish()">Terminer</button>
    </div>
  </section>
</template>
