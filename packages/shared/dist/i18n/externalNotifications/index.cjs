Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#endregion
//#region src/i18n/externalNotifications/index.ts
const LOCALES = {
	en: {
		email: {
			footer: "You received this because you have notifications enabled in memove.",
			manage: "Manage preferences in Settings",
			madeWith: "Made with",
			openMemove: "Open memove"
		},
		events: {
			trip_invite: (p) => ({
				title: `Trip invite: "${p.trip}"`,
				body: `${p.actor} invited ${p.invitee || "a member"} to the trip "${p.trip}".`
			}),
			booking_change: (p) => ({
				title: `New booking: ${p.booking}`,
				body: `${p.actor} added a new ${p.type} "${p.booking}" to "${p.trip}".`
			}),
			trip_reminder: (p) => ({
				title: `Trip reminder: ${p.trip}`,
				body: `Your trip "${p.trip}" is coming up soon!`
			}),
			todo_due: (p) => ({
				title: `To-do due: ${p.todo}`,
				body: `"${p.todo}" in "${p.trip}" is due on ${p.due}.`
			}),
			vacay_invite: (p) => ({
				title: "Vacay Fusion Invite",
				body: `${p.actor} invited you to fuse vacation plans. Open memove to accept or decline.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} photos shared`,
				body: `${p.actor} shared ${p.count} photo(s) in "${p.trip}".`
			}),
			collab_message: (p) => ({
				title: `New message in "${p.trip}"`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Packing: ${p.category}`,
				body: `${p.actor} assigned you to the "${p.category}" packing category in "${p.trip}".`
			}),
			version_available: (p) => ({
				title: "New memove version available",
				body: `memove ${p.version} is now available. Visit the admin panel to update.`
			}),
			synology_session_cleared: () => ({
				title: "Synology session cleared",
				body: "Your Synology account or URL changed. You have been logged out of Synology Photos."
			})
		},
		passwordReset: {
			subject: "Reset your password",
			greeting: "Hi",
			body: "We received a request to reset the password for your memove account. Click the button below to set a new password.",
			ctaIntro: "Reset password",
			expiry: "This link expires in 60 minutes.",
			ignore: "If you didn't request this, you can safely ignore this email — your password won't change."
		}
	},
	de: {
		email: {
			footer: "Du erhältst diese E-Mail, weil du Benachrichtigungen in memove aktiviert hast.",
			manage: "Einstellungen verwalten",
			madeWith: "Made with",
			openMemove: "memove öffnen"
		},
		events: {
			trip_invite: (p) => ({
				title: `Einladung zu "${p.trip}"`,
				body: `${p.actor} hat ${p.invitee || "ein Mitglied"} zur Reise "${p.trip}" eingeladen.`
			}),
			booking_change: (p) => ({
				title: `Neue Buchung: ${p.booking}`,
				body: `${p.actor} hat eine neue Buchung "${p.booking}" (${p.type}) zu "${p.trip}" hinzugefügt.`
			}),
			trip_reminder: (p) => ({
				title: `Reiseerinnerung: ${p.trip}`,
				body: `Deine Reise "${p.trip}" steht bald an!`
			}),
			todo_due: (p) => ({
				title: `Aufgabe fällig: ${p.todo}`,
				body: `"${p.todo}" in "${p.trip}" ist am ${p.due} fällig.`
			}),
			vacay_invite: (p) => ({
				title: "Vacay Fusion-Einladung",
				body: `${p.actor} hat dich eingeladen, Urlaubspläne zu fusionieren. Öffne memove um anzunehmen oder abzulehnen.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} Fotos geteilt`,
				body: `${p.actor} hat ${p.count} Foto(s) in "${p.trip}" geteilt.`
			}),
			collab_message: (p) => ({
				title: `Neue Nachricht in "${p.trip}"`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Packliste: ${p.category}`,
				body: `${p.actor} hat dich der Kategorie "${p.category}" in der Packliste von "${p.trip}" zugewiesen.`
			}),
			version_available: (p) => ({
				title: "Neue memove-Version verfügbar",
				body: `memove ${p.version} ist jetzt verfügbar. Besuche das Admin-Panel zum Aktualisieren.`
			}),
			synology_session_cleared: () => ({
				title: "Synology-Sitzung beendet",
				body: "Dein Synology-Konto oder die URL hat sich geändert. Du wurdest von Synology Photos abgemeldet."
			})
		},
		passwordReset: {
			subject: "Passwort zurücksetzen",
			greeting: "Hallo",
			body: "Wir haben eine Anfrage erhalten, das Passwort für dein memove-Konto zurückzusetzen. Klicke auf den Button unten, um ein neues Passwort festzulegen.",
			ctaIntro: "Passwort zurücksetzen",
			expiry: "Dieser Link ist 60 Minuten gültig.",
			ignore: "Wenn du das nicht warst, ignoriere diese E-Mail — dein Passwort bleibt unverändert."
		}
	},
	fr: {
		email: {
			footer: "Vous recevez cet e-mail car les notifications sont activées dans memove.",
			manage: "Gérer les préférences",
			madeWith: "Made with",
			openMemove: "Ouvrir memove"
		},
		events: {
			trip_invite: (p) => ({
				title: `Invitation à "${p.trip}"`,
				body: `${p.actor} a invité ${p.invitee || "un membre"} au voyage "${p.trip}".`
			}),
			booking_change: (p) => ({
				title: `Nouvelle réservation : ${p.booking}`,
				body: `${p.actor} a ajouté une réservation "${p.booking}" (${p.type}) à "${p.trip}".`
			}),
			trip_reminder: (p) => ({
				title: `Rappel de voyage : ${p.trip}`,
				body: `Votre voyage "${p.trip}" approche !`
			}),
			todo_due: (p) => ({
				title: `Tâche à échéance : ${p.todo}`,
				body: `"${p.todo}" dans "${p.trip}" est due le ${p.due}.`
			}),
			vacay_invite: (p) => ({
				title: "Invitation Vacay Fusion",
				body: `${p.actor} vous invite à fusionner les plans de vacances. Ouvrez memove pour accepter ou refuser.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} photos partagées`,
				body: `${p.actor} a partagé ${p.count} photo(s) dans "${p.trip}".`
			}),
			collab_message: (p) => ({
				title: `Nouveau message dans "${p.trip}"`,
				body: `${p.actor} : ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Bagages : ${p.category}`,
				body: `${p.actor} vous a assigné à la catégorie "${p.category}" dans "${p.trip}".`
			}),
			version_available: (p) => ({
				title: "Nouvelle version memove disponible",
				body: `memove ${p.version} est maintenant disponible. Rendez-vous dans le panneau d'administration pour mettre à jour.`
			}),
			synology_session_cleared: () => ({
				title: "Session Synology effacée",
				body: "Votre compte ou URL Synology a changé. Vous avez été déconnecté de Synology Photos."
			})
		},
		passwordReset: {
			subject: "Réinitialisez votre mot de passe",
			greeting: "Bonjour",
			body: "Nous avons reçu une demande de réinitialisation du mot de passe de votre compte memove. Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe.",
			ctaIntro: "Réinitialiser le mot de passe",
			expiry: "Ce lien expire dans 60 minutes.",
			ignore: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail — votre mot de passe ne changera pas."
		}
	},
	es: {
		email: {
			footer: "Recibiste esto porque tienes las notificaciones activadas en memove.",
			manage: "Gestionar preferencias",
			madeWith: "Made with",
			openMemove: "Abrir memove"
		},
		events: {
			trip_invite: (p) => ({
				title: `Invitación a "${p.trip}"`,
				body: `${p.actor} invitó a ${p.invitee || "un miembro"} al viaje "${p.trip}".`
			}),
			booking_change: (p) => ({
				title: `Nueva reserva: ${p.booking}`,
				body: `${p.actor} añadió una reserva "${p.booking}" (${p.type}) a "${p.trip}".`
			}),
			trip_reminder: (p) => ({
				title: `Recordatorio: ${p.trip}`,
				body: `¡Tu viaje "${p.trip}" se acerca!`
			}),
			todo_due: (p) => ({
				title: `Tarea pendiente: ${p.todo}`,
				body: `"${p.todo}" en "${p.trip}" vence el ${p.due}.`
			}),
			vacay_invite: (p) => ({
				title: "Invitación Vacay Fusion",
				body: `${p.actor} te invitó a fusionar planes de vacaciones. Abre memove para aceptar o rechazar.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} fotos compartidas`,
				body: `${p.actor} compartió ${p.count} foto(s) en "${p.trip}".`
			}),
			collab_message: (p) => ({
				title: `Nuevo mensaje en "${p.trip}"`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Equipaje: ${p.category}`,
				body: `${p.actor} te asignó a la categoría "${p.category}" en "${p.trip}".`
			}),
			version_available: (p) => ({
				title: "Nueva versión de memove disponible",
				body: `memove ${p.version} ya está disponible. Visita el panel de administración para actualizar.`
			}),
			synology_session_cleared: () => ({
				title: "Sesión de Synology cerrada",
				body: "Tu cuenta o URL de Synology ha cambiado. Has cerrado sesión en Synology Photos."
			})
		},
		passwordReset: {
			subject: "Restablecer tu contraseña",
			greeting: "Hola",
			body: "Recibimos una solicitud para restablecer la contraseña de tu cuenta de memove. Haz clic en el botón de abajo para establecer una nueva contraseña.",
			ctaIntro: "Restablecer contraseña",
			expiry: "Este enlace caduca en 60 minutos.",
			ignore: "Si no solicitaste esto, puedes ignorar este correo — tu contraseña no cambiará."
		}
	},
	hu: {
		email: {
			footer: "Ezt az értesítést azért kaptad, mert engedélyezted az értesítéseket a memove-ben.",
			manage: "Beállítások kezelése",
			madeWith: "Made with",
			openMemove: "memove megnyitása"
		},
		events: {
			trip_invite: (p) => ({
				title: `Meghívó a(z) "${p.trip}" utazásra`,
				body: `${p.actor} meghívta ${p.invitee || "egy tagot"} a(z) "${p.trip}" utazásra.`
			}),
			booking_change: (p) => ({
				title: `Új foglalás: ${p.booking}`,
				body: `${p.actor} hozzáadott egy "${p.booking}" (${p.type}) foglalást a(z) "${p.trip}" utazáshoz.`
			}),
			trip_reminder: (p) => ({
				title: `Utazás emlékeztető: ${p.trip}`,
				body: `A(z) "${p.trip}" utazás hamarosan kezdődik!`
			}),
			todo_due: (p) => ({
				title: `Teendő esedékes: ${p.todo}`,
				body: `"${p.todo}" (${p.trip}) határideje: ${p.due}.`
			}),
			vacay_invite: (p) => ({
				title: "Vacay Fusion meghívó",
				body: `${p.actor} meghívott a nyaralási tervek összevonásához. Nyissa meg a memove-et az elfogadáshoz vagy elutasításhoz.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} fotó megosztva`,
				body: `${p.actor} ${p.count} fotót osztott meg a(z) "${p.trip}" utazásban.`
			}),
			collab_message: (p) => ({
				title: `Új üzenet a(z) "${p.trip}" utazásban`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Csomagolás: ${p.category}`,
				body: `${p.actor} hozzárendelte Önt a "${p.category}" csomagolási kategóriához a(z) "${p.trip}" utazásban.`
			}),
			version_available: (p) => ({
				title: "Új memove verzió érhető el",
				body: `A memove ${p.version} elérhető. Látogasson el az adminisztrációs panelre a frissítéshez.`
			}),
			synology_session_cleared: () => ({
				title: "Synology munkamenet törölve",
				body: "A Synology fiókja vagy URL-je megváltozott. Kijelentkeztek a Synology Photos-ból."
			})
		},
		passwordReset: {
			subject: "Jelszó visszaállítása",
			greeting: "Szia",
			body: "Kérést kaptunk a memove-fiókod jelszavának visszaállítására. Kattints az alábbi gombra az új jelszó beállításához.",
			ctaIntro: "Jelszó visszaállítása",
			expiry: "Ez a link 60 perc után lejár.",
			ignore: "Ha nem te kérted ezt, nyugodtan hagyd figyelmen kívül ezt az e-mailt — a jelszavad változatlan marad."
		}
	},
	nl: {
		email: {
			footer: "Je ontvangt dit omdat je meldingen hebt ingeschakeld in memove.",
			manage: "Voorkeuren beheren",
			madeWith: "Made with",
			openMemove: "memove openen"
		},
		events: {
			trip_invite: (p) => ({
				title: `Uitnodiging voor "${p.trip}"`,
				body: `${p.actor} heeft ${p.invitee || "een lid"} uitgenodigd voor de reis "${p.trip}".`
			}),
			booking_change: (p) => ({
				title: `Nieuwe boeking: ${p.booking}`,
				body: `${p.actor} heeft een boeking "${p.booking}" (${p.type}) toegevoegd aan "${p.trip}".`
			}),
			trip_reminder: (p) => ({
				title: `Reisherinnering: ${p.trip}`,
				body: `Je reis "${p.trip}" komt eraan!`
			}),
			todo_due: (p) => ({
				title: `Taak verloopt: ${p.todo}`,
				body: `"${p.todo}" in "${p.trip}" verloopt op ${p.due}.`
			}),
			vacay_invite: (p) => ({
				title: "Vacay Fusion uitnodiging",
				body: `${p.actor} nodigt je uit om vakantieplannen te fuseren. Open memove om te accepteren of af te wijzen.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} foto's gedeeld`,
				body: `${p.actor} heeft ${p.count} foto('s) gedeeld in "${p.trip}".`
			}),
			collab_message: (p) => ({
				title: `Nieuw bericht in "${p.trip}"`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Paklijst: ${p.category}`,
				body: `${p.actor} heeft je toegewezen aan de categorie "${p.category}" in "${p.trip}".`
			}),
			version_available: (p) => ({
				title: "Nieuwe memove-versie beschikbaar",
				body: `memove ${p.version} is nu beschikbaar. Bezoek het beheerderspaneel om bij te werken.`
			}),
			synology_session_cleared: () => ({
				title: "Synology-sessie gewist",
				body: "Je Synology-account of URL is gewijzigd. Je bent uitgelogd bij Synology Photos."
			})
		},
		passwordReset: {
			subject: "Reset je wachtwoord",
			greeting: "Hallo",
			body: "We hebben een verzoek ontvangen om het wachtwoord voor je memove-account te resetten. Klik op de knop hieronder om een nieuw wachtwoord in te stellen.",
			ctaIntro: "Wachtwoord resetten",
			expiry: "Deze link verloopt over 60 minuten.",
			ignore: "Als jij dit niet hebt aangevraagd, kun je deze e-mail negeren — je wachtwoord blijft ongewijzigd."
		}
	},
	br: {
		email: {
			footer: "Você recebeu isso porque tem as notificações ativadas no memove.",
			manage: "Gerenciar preferências nas configurações",
			madeWith: "Made with",
			openMemove: "Abrir memove"
		},
		events: {
			trip_invite: (p) => ({
				title: `Convite para "${p.trip}"`,
				body: `${p.actor} convidou ${p.invitee || "um membro"} para a viagem "${p.trip}".`
			}),
			booking_change: (p) => ({
				title: `Nova reserva: ${p.booking}`,
				body: `${p.actor} adicionou uma reserva "${p.booking}" (${p.type}) em "${p.trip}".`
			}),
			trip_reminder: (p) => ({
				title: `Lembrete: ${p.trip}`,
				body: `Sua viagem "${p.trip}" está chegando!`
			}),
			todo_due: (p) => ({
				title: `Tarefa com vencimento: ${p.todo}`,
				body: `"${p.todo}" em "${p.trip}" vence em ${p.due}.`
			}),
			vacay_invite: (p) => ({
				title: "Convite Vacay Fusion",
				body: `${p.actor} convidou você para fundir planos de férias. Abra o memove para aceitar ou recusar.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} fotos compartilhadas`,
				body: `${p.actor} compartilhou ${p.count} foto(s) em "${p.trip}".`
			}),
			collab_message: (p) => ({
				title: `Nova mensagem em "${p.trip}"`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Bagagem: ${p.category}`,
				body: `${p.actor} atribuiu você à categoria "${p.category}" em "${p.trip}".`
			}),
			version_available: (p) => ({
				title: "Nova versão do memove disponível",
				body: `O memove ${p.version} está disponível. Acesse o painel de administração para atualizar.`
			}),
			synology_session_cleared: () => ({
				title: "Sessão Synology encerrada",
				body: "Sua conta ou URL do Synology foi alterada. Você foi desconectado do Synology Photos."
			})
		},
		passwordReset: {
			subject: "Redefinir sua senha",
			greeting: "Olá",
			body: "Recebemos um pedido para redefinir a senha da sua conta memove. Clique no botão abaixo para definir uma nova senha.",
			ctaIntro: "Redefinir senha",
			expiry: "Este link expira em 60 minutos.",
			ignore: "Se você não solicitou isto, pode ignorar este e-mail — sua senha não será alterada."
		}
	},
	cs: {
		email: {
			footer: "Toto jsi obdržel/a, protože máš povoleny upozornění v memove.",
			manage: "Spravovat předvolby v nastavení",
			madeWith: "Made with",
			openMemove: "Otevřít memove"
		},
		events: {
			trip_invite: (p) => ({
				title: `Pozvánka do "${p.trip}"`,
				body: `${p.actor} pozval ${p.invitee || "člena"} na výlet "${p.trip}".`
			}),
			booking_change: (p) => ({
				title: `Nová rezervace: ${p.booking}`,
				body: `${p.actor} přidal rezervaci "${p.booking}" (${p.type}) k "${p.trip}".`
			}),
			trip_reminder: (p) => ({
				title: `Připomínka výletu: ${p.trip}`,
				body: `Váš výlet "${p.trip}" se blíží!`
			}),
			todo_due: (p) => ({
				title: `Úkol se blíží: ${p.todo}`,
				body: `"${p.todo}" ve výletě "${p.trip}" má termín ${p.due}.`
			}),
			vacay_invite: (p) => ({
				title: "Pozvánka Vacay Fusion",
				body: `${p.actor} vás pozval ke spojení dovolenkových plánů. Otevřete memove pro přijetí nebo odmítnutí.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} sdílených fotek`,
				body: `${p.actor} sdílel ${p.count} foto v "${p.trip}".`
			}),
			collab_message: (p) => ({
				title: `Nová zpráva v "${p.trip}"`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Balení: ${p.category}`,
				body: `${p.actor} vás přiřadil do kategorie "${p.category}" v "${p.trip}".`
			}),
			version_available: (p) => ({
				title: "Nová verze memove dostupná",
				body: `memove ${p.version} je nyní dostupný. Navštivte administrátorský panel pro aktualizaci.`
			}),
			synology_session_cleared: () => ({
				title: "Relace Synology byla zrušena",
				body: "Váš účet nebo URL Synology se změnil. Byli jste odhlášeni ze Synology Photos."
			})
		},
		passwordReset: {
			subject: "Obnovení hesla",
			greeting: "Ahoj",
			body: "Obdrželi jsme žádost o obnovení hesla k tvému účtu memove. Klikni na tlačítko níže a nastav nové heslo.",
			ctaIntro: "Obnovit heslo",
			expiry: "Odkaz vyprší za 60 minut.",
			ignore: "Pokud jsi o obnovení nežádal/a, tento e-mail ignoruj — heslo zůstane beze změny."
		}
	},
	pl: {
		email: {
			footer: "Otrzymałeś/aś tę wiadomość, ponieważ masz włączone powiadomienia w memove.",
			manage: "Zarządzaj preferencjami w ustawieniach",
			madeWith: "Made with",
			openMemove: "Otwórz memove"
		},
		events: {
			trip_invite: (p) => ({
				title: `Zaproszenie do "${p.trip}"`,
				body: `${p.actor} zaprosił ${p.invitee || "członka"} do podróży "${p.trip}".`
			}),
			booking_change: (p) => ({
				title: `Nowa rezerwacja: ${p.booking}`,
				body: `${p.actor} dodał rezerwację "${p.booking}" (${p.type}) do "${p.trip}".`
			}),
			trip_reminder: (p) => ({
				title: `Przypomnienie o podróży: ${p.trip}`,
				body: `Twoja podróż "${p.trip}" zbliża się!`
			}),
			todo_due: (p) => ({
				title: `Zadanie z terminem: ${p.todo}`,
				body: `"${p.todo}" w "${p.trip}" — termin ${p.due}.`
			}),
			vacay_invite: (p) => ({
				title: "Zaproszenie Vacay Fusion",
				body: `${p.actor} zaprosił Cię do połączenia planów urlopowych. Otwórz memove, aby zaakceptować lub odrzucić.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} zdjęć udostępnionych`,
				body: `${p.actor} udostępnił ${p.count} zdjęcie/zdjęcia w "${p.trip}".`
			}),
			collab_message: (p) => ({
				title: `Nowa wiadomość w "${p.trip}"`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Pakowanie: ${p.category}`,
				body: `${p.actor} przypisał Cię do kategorii "${p.category}" w "${p.trip}".`
			}),
			version_available: (p) => ({
				title: "Nowa wersja memove dostępna",
				body: `memove ${p.version} jest teraz dostępny. Odwiedź panel administracyjny, aby zaktualizować.`
			}),
			synology_session_cleared: () => ({
				title: "Sesja Synology wyczyszczona",
				body: "Twoje konto lub URL Synology uległo zmianie. Zostałeś wylogowany z Synology Photos."
			})
		},
		passwordReset: {
			subject: "Zresetuj hasło",
			greeting: "Cześć",
			body: "Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta memove. Kliknij przycisk poniżej, aby ustawić nowe hasło.",
			ctaIntro: "Zresetuj hasło",
			expiry: "Link wygaśnie za 60 minut.",
			ignore: "Jeśli to nie Ty, zignoruj tę wiadomość — Twoje hasło pozostanie bez zmian."
		}
	},
	ru: {
		email: {
			footer: "Вы получили это, потому что у вас включены уведомления в memove.",
			manage: "Управление настройками",
			madeWith: "Made with",
			openMemove: "Открыть memove"
		},
		events: {
			trip_invite: (p) => ({
				title: `Приглашение в "${p.trip}"`,
				body: `${p.actor} пригласил ${p.invitee || "участника"} в поездку "${p.trip}".`
			}),
			booking_change: (p) => ({
				title: `Новое бронирование: ${p.booking}`,
				body: `${p.actor} добавил бронирование "${p.booking}" (${p.type}) в "${p.trip}".`
			}),
			trip_reminder: (p) => ({
				title: `Напоминание: ${p.trip}`,
				body: `Ваша поездка "${p.trip}" скоро начнётся!`
			}),
			todo_due: (p) => ({
				title: `Задача к сроку: ${p.todo}`,
				body: `"${p.todo}" в поездке "${p.trip}" — срок ${p.due}.`
			}),
			vacay_invite: (p) => ({
				title: "Приглашение Vacay Fusion",
				body: `${p.actor} приглашает вас объединить планы отпуска. Откройте memove для подтверждения.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} фото`,
				body: `${p.actor} поделился ${p.count} фото в "${p.trip}".`
			}),
			collab_message: (p) => ({
				title: `Новое сообщение в "${p.trip}"`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Список вещей: ${p.category}`,
				body: `${p.actor} назначил вас в категорию "${p.category}" в "${p.trip}".`
			}),
			version_available: (p) => ({
				title: "Доступна новая версия memove",
				body: `memove ${p.version} теперь доступен. Перейдите в панель администратора для обновления.`
			}),
			synology_session_cleared: () => ({
				title: "Сессия Synology сброшена",
				body: "Ваш аккаунт или URL Synology изменился. Вы вышли из Synology Photos."
			})
		},
		passwordReset: {
			subject: "Сброс пароля",
			greeting: "Здравствуйте",
			body: "Мы получили запрос на сброс пароля вашего аккаунта memove. Нажмите кнопку ниже, чтобы установить новый пароль.",
			ctaIntro: "Сбросить пароль",
			expiry: "Ссылка действительна 60 минут.",
			ignore: "Если вы не запрашивали сброс — просто проигнорируйте это письмо, пароль останется прежним."
		}
	},
	zh: {
		email: {
			footer: "您收到此邮件是因为您在 memove 中启用了通知。",
			manage: "管理偏好设置",
			madeWith: "Made with",
			openMemove: "打开 memove"
		},
		events: {
			trip_invite: (p) => ({
				title: `邀请加入"${p.trip}"`,
				body: `${p.actor} 邀请了 ${p.invitee || "成员"} 加入旅行"${p.trip}"。`
			}),
			booking_change: (p) => ({
				title: `新预订：${p.booking}`,
				body: `${p.actor} 在"${p.trip}"中添加了预订"${p.booking}"（${p.type}）。`
			}),
			trip_reminder: (p) => ({
				title: `旅行提醒：${p.trip}`,
				body: `你的旅行"${p.trip}"即将开始！`
			}),
			todo_due: (p) => ({
				title: `待办事项即将到期：${p.todo}`,
				body: `"${p.trip}" 中的"${p.todo}"将于 ${p.due} 到期。`
			}),
			vacay_invite: (p) => ({
				title: "Vacay 融合邀请",
				body: `${p.actor} 邀请你合并假期计划。打开 memove 接受或拒绝。`
			}),
			photos_shared: (p) => ({
				title: `${p.count} 张照片已分享`,
				body: `${p.actor} 在"${p.trip}"中分享了 ${p.count} 张照片。`
			}),
			collab_message: (p) => ({
				title: `"${p.trip}"中的新消息`,
				body: `${p.actor}：${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `行李清单：${p.category}`,
				body: `${p.actor} 将你分配到"${p.trip}"中的"${p.category}"类别。`
			}),
			version_available: (p) => ({
				title: "新版 memove 可用",
				body: `memove ${p.version} 现已可用。请前往管理面板进行更新。`
			}),
			synology_session_cleared: () => ({
				title: "Synology 会话已清除",
				body: "您的 Synology 账户或 URL 已更改，您已退出 Synology Photos。"
			})
		},
		passwordReset: {
			subject: "重置您的密码",
			greeting: "您好",
			body: "我们收到了重置您的 memove 账户密码的请求。点击下方按钮设置新密码。",
			ctaIntro: "重置密码",
			expiry: "此链接将在 60 分钟后失效。",
			ignore: "如果这不是您本人的请求，可以忽略本邮件 — 您的密码不会改变。"
		}
	},
	"zh-TW": {
		email: {
			footer: "您收到這封郵件是因為您在 memove 中啟用了通知。",
			manage: "管理偏好設定",
			madeWith: "Made with",
			openMemove: "開啟 memove"
		},
		events: {
			trip_invite: (p) => ({
				title: `邀請加入「${p.trip}」`,
				body: `${p.actor} 邀請了 ${p.invitee || "成員"} 加入行程「${p.trip}」。`
			}),
			booking_change: (p) => ({
				title: `新預訂：${p.booking}`,
				body: `${p.actor} 在「${p.trip}」中新增了預訂「${p.booking}」（${p.type}）。`
			}),
			trip_reminder: (p) => ({
				title: `行程提醒：${p.trip}`,
				body: `您的行程「${p.trip}」即將開始！`
			}),
			todo_due: (p) => ({
				title: `待辦事項即將到期：${p.todo}`,
				body: `「${p.trip}」中的「${p.todo}」將於 ${p.due} 到期。`
			}),
			vacay_invite: (p) => ({
				title: "Vacay 融合邀請",
				body: `${p.actor} 邀請您合併假期計畫。開啟 memove 以接受或拒絕。`
			}),
			photos_shared: (p) => ({
				title: `已分享 ${p.count} 張照片`,
				body: `${p.actor} 在「${p.trip}」中分享了 ${p.count} 張照片。`
			}),
			collab_message: (p) => ({
				title: `「${p.trip}」中的新訊息`,
				body: `${p.actor}：${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `打包清單：${p.category}`,
				body: `${p.actor} 已將您指派到「${p.trip}」中的「${p.category}」分類。`
			}),
			version_available: (p) => ({
				title: "新版 memove 可用",
				body: `memove ${p.version} 現已可用。請前往管理面板進行更新。`
			}),
			synology_session_cleared: () => ({
				title: "Synology 工作階段已清除",
				body: "您的 Synology 帳戶或 URL 已變更，您已登出 Synology Photos。"
			})
		},
		passwordReset: {
			subject: "重設您的密碼",
			greeting: "您好",
			body: "我們收到了重設您 memove 帳號密碼的請求。點擊下方按鈕以設定新密碼。",
			ctaIntro: "重設密碼",
			expiry: "此連結將於 60 分鐘後失效。",
			ignore: "若非您本人發起的請求，請忽略此郵件 — 您的密碼不會變更。"
		}
	},
	it: {
		email: {
			footer: "Hai ricevuto questa email perché hai le notifiche abilitate in memove.",
			manage: "Gestisci le preferenze nelle impostazioni",
			madeWith: "Made with",
			openMemove: "Apri memove"
		},
		events: {
			trip_invite: (p) => ({
				title: `Invito a "${p.trip}"`,
				body: `${p.actor} ha invitato ${p.invitee || "un membro"} al viaggio "${p.trip}".`
			}),
			booking_change: (p) => ({
				title: `Nuova prenotazione: ${p.booking}`,
				body: `${p.actor} ha aggiunto una prenotazione "${p.booking}" (${p.type}) a "${p.trip}".`
			}),
			trip_reminder: (p) => ({
				title: `Promemoria viaggio: ${p.trip}`,
				body: `Il tuo viaggio "${p.trip}" si avvicina!`
			}),
			todo_due: (p) => ({
				title: `Attività in scadenza: ${p.todo}`,
				body: `"${p.todo}" in "${p.trip}" scade il ${p.due}.`
			}),
			vacay_invite: (p) => ({
				title: "Invito Vacay Fusion",
				body: `${p.actor} ti ha invitato a fondere i piani vacanza. Apri memove per accettare o rifiutare.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} foto condivise`,
				body: `${p.actor} ha condiviso ${p.count} foto in "${p.trip}".`
			}),
			collab_message: (p) => ({
				title: `Nuovo messaggio in "${p.trip}"`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Bagagli: ${p.category}`,
				body: `${p.actor} ti ha assegnato alla categoria "${p.category}" in "${p.trip}".`
			}),
			version_available: (p) => ({
				title: "Nuova versione memove disponibile",
				body: `memove ${p.version} è ora disponibile. Visita il pannello di amministrazione per aggiornare.`
			}),
			synology_session_cleared: () => ({
				title: "Sessione Synology rimossa",
				body: "Il tuo account o URL Synology è cambiato. Sei stato disconnesso da Synology Photos."
			})
		},
		passwordReset: {
			subject: "Reimposta la tua password",
			greeting: "Ciao",
			body: "Abbiamo ricevuto una richiesta di reimpostazione della password per il tuo account memove. Clicca il pulsante qui sotto per impostare una nuova password.",
			ctaIntro: "Reimposta password",
			expiry: "Questo link scade tra 60 minuti.",
			ignore: "Se non hai richiesto questa operazione, ignora questa email — la tua password non cambierà."
		}
	},
	tr: {
		email: {
			footer: "memove'te bildirimleri etkinleştirdiğiniz için bunu aldınız.",
			manage: "Ayarlarda tercihleri yönetin",
			madeWith: "Made with",
			openMemove: "memove'i aç"
		},
		events: {
			trip_invite: (p) => ({
				title: `"${p.trip}" seyahatine davet`,
				body: `${p.actor}, ${p.invitee || "bir üyeyi"} "${p.trip}" seyahatine davet etti.`
			}),
			booking_change: (p) => ({
				title: `Yeni rezervasyon: ${p.booking}`,
				body: `${p.actor}, "${p.trip}" seyahatine "${p.booking}" (${p.type}) rezervasyonu ekledi.`
			}),
			trip_reminder: (p) => ({
				title: `Seyahat hatırlatıcısı: ${p.trip}`,
				body: `"${p.trip}" seyahatiniz yaklaşıyor!`
			}),
			todo_due: (p) => ({
				title: `Görev süresi dolmak üzere: ${p.todo}`,
				body: `"${p.trip}" içindeki "${p.todo}" görevi ${p.due} tarihinde bitiyor.`
			}),
			vacay_invite: (p) => ({
				title: "Vacay Fusion Daveti",
				body: `${p.actor} sizi tatil planlarını birleştirmeye davet etti. Kabul etmek veya reddetmek için memove'i açın.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} fotoğraf paylaşıldı`,
				body: `${p.actor}, "${p.trip}" içinde ${p.count} fotoğraf paylaştı.`
			}),
			collab_message: (p) => ({
				title: `"${p.trip}" içinde yeni mesaj`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Bagaj: ${p.category}`,
				body: `${p.actor}, sizi "${p.trip}" içindeki "${p.category}" bagaj kategorisine atadı.`
			}),
			version_available: (p) => ({
				title: "Yeni memove sürümü mevcut",
				body: `memove ${p.version} artık mevcut. Güncellemek için yönetici panelini ziyaret edin.`
			}),
			synology_session_cleared: () => ({
				title: "Synology oturumu temizlendi",
				body: "Synology hesabınız veya URL değişti. Synology Photos oturumunuz kapatıldı."
			})
		},
		passwordReset: {
			subject: "Şifrenizi sıfırlayın",
			greeting: "Merhaba",
			body: "memove hesabınızın şifresini sıfırlamak için bir istek aldık. Yeni bir şifre belirlemek için aşağıdaki butona tıklayın.",
			ctaIntro: "Şifreyi sıfırla",
			expiry: "Bu bağlantı 60 dakika içinde sona erer.",
			ignore: "Bu isteği siz yapmadıysanız, bu e-postayı güvenle yok sayabilirsiniz — şifreniz değişmeyecektir."
		}
	},
	ar: {
		email: {
			footer: "تلقيت هذا لأنك قمت بتفعيل الإشعارات في memove.",
			manage: "إدارة التفضيلات",
			madeWith: "Made with",
			openMemove: "فتح memove"
		},
		events: {
			trip_invite: (p) => ({
				title: `دعوة إلى "${p.trip}"`,
				body: `${p.actor} دعا ${p.invitee || "عضو"} إلى الرحلة "${p.trip}".`
			}),
			booking_change: (p) => ({
				title: `حجز جديد: ${p.booking}`,
				body: `${p.actor} أضاف حجز "${p.booking}" (${p.type}) إلى "${p.trip}".`
			}),
			trip_reminder: (p) => ({
				title: `تذكير: ${p.trip}`,
				body: `رحلتك "${p.trip}" تقترب!`
			}),
			todo_due: (p) => ({
				title: `مهمة مستحقة: ${p.todo}`,
				body: `"${p.todo}" في "${p.trip}" مستحقة في ${p.due}.`
			}),
			vacay_invite: (p) => ({
				title: "دعوة دمج الإجازة",
				body: `${p.actor} يدعوك لدمج خطط الإجازة. افتح memove للقبول أو الرفض.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} صور مشتركة`,
				body: `${p.actor} شارك ${p.count} صورة في "${p.trip}".`
			}),
			collab_message: (p) => ({
				title: `رسالة جديدة في "${p.trip}"`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `قائمة التعبئة: ${p.category}`,
				body: `${p.actor} عيّنك في فئة "${p.category}" في "${p.trip}".`
			}),
			version_available: (p) => ({
				title: "إصدار memove جديد متاح",
				body: `memove ${p.version} متاح الآن. تفضل بزيارة لوحة الإدارة للتحديث.`
			}),
			synology_session_cleared: () => ({
				title: "تمت إعادة تعيين جلسة Synology",
				body: "تغيّر حسابك أو رابط Synology. تم تسجيل خروجك من Synology Photos."
			})
		},
		passwordReset: {
			subject: "إعادة تعيين كلمة المرور",
			greeting: "مرحبا",
			body: "تلقينا طلبًا لإعادة تعيين كلمة المرور لحسابك في memove. انقر على الزر أدناه لتعيين كلمة مرور جديدة.",
			ctaIntro: "إعادة تعيين كلمة المرور",
			expiry: "تنتهي صلاحية هذا الرابط خلال 60 دقيقة.",
			ignore: "إذا لم تطلب هذا، يمكنك تجاهل هذه الرسالة — لن تتغير كلمة المرور الخاصة بك."
		}
	},
	id: {
		email: {
			footer: "Anda menerima ini karena Anda telah mengaktifkan notifikasi di memove.",
			manage: "Kelola preferensi di Pengaturan",
			madeWith: "Dibuat dengan",
			openMemove: "Buka memove"
		},
		events: {
			trip_invite: (p) => ({
				title: `Undangan perjalanan: "${p.trip}"`,
				body: `${p.actor} mengundang ${p.invitee || "seorang anggota"} ke perjalanan "${p.trip}".`
			}),
			booking_change: (p) => ({
				title: `Pemesanan baru: ${p.booking}`,
				body: `${p.actor} menambahkan "${p.booking}" (${p.type}) baru ke "${p.trip}".`
			}),
			trip_reminder: (p) => ({
				title: `Pengingat perjalanan: ${p.trip}`,
				body: `Perjalanan Anda "${p.trip}" akan segera tiba!`
			}),
			todo_due: (p) => ({
				title: `Tugas jatuh tempo: ${p.todo}`,
				body: `"${p.todo}" di "${p.trip}" jatuh tempo pada ${p.due}.`
			}),
			vacay_invite: (p) => ({
				title: "Undangan Penggabungan Vacay",
				body: `${p.actor} mengundang Anda untuk menggabungkan rencana liburan. Buka memove untuk menerima atau menolak.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} foto dibagikan`,
				body: `${p.actor} membagikan ${p.count} foto di "${p.trip}".`
			}),
			collab_message: (p) => ({
				title: `Pesan baru di "${p.trip}"`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Pengepakan: ${p.category}`,
				body: `${p.actor} menugaskan Anda ke kategori "${p.category}" di "${p.trip}".`
			}),
			version_available: (p) => ({
				title: "Versi memove baru tersedia",
				body: `memove ${p.version} sekarang tersedia. Kunjungi panel admin untuk memperbarui.`
			}),
			synology_session_cleared: () => ({
				title: "Sesi Synology dihapus",
				body: "Akun atau URL Synology Anda berubah. Anda telah keluar dari Synology Photos."
			})
		},
		passwordReset: {
			subject: "Setel ulang kata sandi Anda",
			greeting: "Halo",
			body: "Kami menerima permintaan untuk menyetel ulang kata sandi akun memove Anda. Klik tombol di bawah untuk menetapkan kata sandi baru.",
			ctaIntro: "Setel ulang kata sandi",
			expiry: "Tautan ini kedaluwarsa dalam 60 menit.",
			ignore: "Jika Anda tidak meminta ini, Anda dapat mengabaikan email ini — kata sandi Anda tidak akan berubah."
		}
	},
	ja: {
		email: {
			footer: "memoveで通知を有効にしているため、このメールが届きました。",
			manage: "設定で通知設定を管理",
			madeWith: "Made with",
			openMemove: "memoveを開く"
		},
		events: {
			trip_invite: (p) => ({
				title: `「${p.trip}」への旅行招待`,
				body: `${p.actor}が${p.invitee || "メンバー"}を「${p.trip}」の旅行に招待しました。`
			}),
			booking_change: (p) => ({
				title: `新しい予約：${p.booking}`,
				body: `${p.actor}が「${p.trip}」に「${p.booking}」（${p.type}）を追加しました。`
			}),
			trip_reminder: (p) => ({
				title: `旅行リマインダー：${p.trip}`,
				body: `「${p.trip}」の旅行が近づいています！`
			}),
			todo_due: (p) => ({
				title: `期限のタスク：${p.todo}`,
				body: `「${p.trip}」の「${p.todo}」は${p.due}が期限です。`
			}),
			vacay_invite: (p) => ({
				title: "Vacay Fusion招待",
				body: `${p.actor}が休暇プランの統合に招待しています。memoveを開いて承認または拒否してください。`
			}),
			photos_shared: (p) => ({
				title: `${p.count}枚の写真が共有されました`,
				body: `${p.actor}が「${p.trip}」で${p.count}枚の写真を共有しました。`
			}),
			collab_message: (p) => ({
				title: `「${p.trip}」の新しいメッセージ`,
				body: `${p.actor}：${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `パッキング：${p.category}`,
				body: `${p.actor}が「${p.trip}」の「${p.category}」カテゴリにあなたを割り当てました。`
			}),
			version_available: (p) => ({
				title: "新しいmemoveバージョンが利用可能",
				body: `memove ${p.version}が利用可能になりました。管理パネルからアップデートしてください。`
			}),
			synology_session_cleared: () => ({
				title: "Synologyセッションがクリアされました",
				body: "SynologyアカウントまたはURLが変更されました。Synology Photosからログアウトされました。"
			})
		},
		passwordReset: {
			subject: "パスワードをリセット",
			greeting: "こんにちは",
			body: "memoveアカウントのパスワードリセットリクエストを受け付けました。以下のボタンをクリックして新しいパスワードを設定してください。",
			ctaIntro: "パスワードをリセット",
			expiry: "このリンクは60分後に期限切れになります。",
			ignore: "このリクエストをご自身でしていない場合は、このメールを無視してください — パスワードは変更されません。"
		}
	},
	ko: {
		email: {
			footer: "memove에서 알림을 활성화했기 때문에 이 이메일을 받으셨습니다.",
			manage: "설정에서 환경설정 관리",
			madeWith: "Made with",
			openMemove: "memove 열기"
		},
		events: {
			trip_invite: (p) => ({
				title: `"${p.trip}" 여행 초대`,
				body: `${p.actor}이(가) ${p.invitee || "멤버"}를 "${p.trip}" 여행에 초대했습니다.`
			}),
			booking_change: (p) => ({
				title: `새 예약: ${p.booking}`,
				body: `${p.actor}이(가) "${p.trip}"에 "${p.booking}" (${p.type}) 예약을 추가했습니다.`
			}),
			trip_reminder: (p) => ({
				title: `여행 알림: ${p.trip}`,
				body: `"${p.trip}" 여행이 곧 시작됩니다!`
			}),
			todo_due: (p) => ({
				title: `할 일 마감: ${p.todo}`,
				body: `"${p.trip}"의 "${p.todo}"은(는) ${p.due}에 마감됩니다.`
			}),
			vacay_invite: (p) => ({
				title: "Vacay Fusion 초대",
				body: `${p.actor}이(가) 휴가 계획을 합치도록 초대했습니다. memove을 열어 수락하거나 거절하세요.`
			}),
			photos_shared: (p) => ({
				title: `${p.count}장의 사진이 공유되었습니다`,
				body: `${p.actor}이(가) "${p.trip}"에서 ${p.count}장의 사진을 공유했습니다.`
			}),
			collab_message: (p) => ({
				title: `"${p.trip}"의 새 메시지`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `짐 꾸리기: ${p.category}`,
				body: `${p.actor}이(가) "${p.trip}"의 "${p.category}" 카테고리에 당신을 할당했습니다.`
			}),
			version_available: (p) => ({
				title: "새 memove 버전 사용 가능",
				body: `memove ${p.version}을 사용할 수 있습니다. 관리자 패널에서 업데이트하세요.`
			}),
			synology_session_cleared: () => ({
				title: "Synology 세션이 초기화되었습니다",
				body: "Synology 계정 또는 URL이 변경되었습니다. Synology Photos에서 로그아웃되었습니다."
			})
		},
		passwordReset: {
			subject: "비밀번호 재설정",
			greeting: "안녕하세요",
			body: "memove 계정 비밀번호 재설정 요청을 받았습니다. 아래 버튼을 클릭하여 새 비밀번호를 설정하세요.",
			ctaIntro: "비밀번호 재설정",
			expiry: "이 링크는 60분 후에 만료됩니다.",
			ignore: "본인이 요청하지 않으셨다면 이 이메일을 무시하셔도 됩니다 — 비밀번호는 변경되지 않습니다."
		}
	},
	uk: {
		email: {
			footer: "Ви отримали це, оскільки увімкнули сповіщення в memove.",
			manage: "Керувати налаштуваннями у Налаштуваннях",
			madeWith: "Made with",
			openMemove: "Відкрити memove"
		},
		events: {
			trip_invite: (p) => ({
				title: `Запрошення до "${p.trip}"`,
				body: `${p.actor} запросив ${p.invitee || "учасника"} до подорожі "${p.trip}".`
			}),
			booking_change: (p) => ({
				title: `Нове бронювання: ${p.booking}`,
				body: `${p.actor} додав бронювання "${p.booking}" (${p.type}) до "${p.trip}".`
			}),
			trip_reminder: (p) => ({
				title: `Нагадування про подорож: ${p.trip}`,
				body: `Ваша подорож "${p.trip}" наближається!`
			}),
			todo_due: (p) => ({
				title: `Завдання з терміном: ${p.todo}`,
				body: `"${p.todo}" у "${p.trip}" — термін ${p.due}.`
			}),
			vacay_invite: (p) => ({
				title: "Запрошення Vacay Fusion",
				body: `${p.actor} запрошує вас об'єднати плани відпустки. Відкрийте memove, щоб прийняти або відхилити.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} фото поділились`,
				body: `${p.actor} поділився ${p.count} фото у "${p.trip}".`
			}),
			collab_message: (p) => ({
				title: `Нове повідомлення у "${p.trip}"`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Пакування: ${p.category}`,
				body: `${p.actor} призначив вас до категорії "${p.category}" у "${p.trip}".`
			}),
			version_available: (p) => ({
				title: "Доступна нова версія memove",
				body: `memove ${p.version} тепер доступний. Перейдіть до панелі адміністратора для оновлення.`
			}),
			synology_session_cleared: () => ({
				title: "Сеанс Synology скинуто",
				body: "Ваш обліковий запис або URL Synology змінився. Ви вийшли з Synology Photos."
			})
		},
		passwordReset: {
			subject: "Скидання пароля",
			greeting: "Привіт",
			body: "Ми отримали запит на скидання пароля вашого облікового запису memove. Натисніть кнопку нижче, щоб встановити новий пароль.",
			ctaIntro: "Скинути пароль",
			expiry: "Це посилання дійсне протягом 60 хвилин.",
			ignore: "Якщо ви не надсилали цей запит, просто проігноруйте цей лист — ваш пароль залишиться незмінним."
		}
	},
	gr: {
		email: {
			footer: "Λάβατε αυτό το μήνυμα επειδή έχετε ενεργοποιήσει τις ειδοποιήσεις στο memove.",
			manage: "Διαχείριση προτιμήσεων στις Ρυθμίσεις",
			madeWith: "Δημιουργήθηκε με",
			openMemove: "Άνοιγμα memove"
		},
		events: {
			trip_invite: (p) => ({
				title: `Πρόσκληση ταξιδιού: "${p.trip}"`,
				body: `Ο/Η ${p.actor} προσκάλεσε ${p.invitee || "ένα μέλος"} στο ταξίδι "${p.trip}".`
			}),
			booking_change: (p) => ({
				title: `Νέα κράτηση: ${p.booking}`,
				body: `Ο/Η ${p.actor} πρόσθεσε μια νέα κράτηση "${p.booking}" (${p.type}) στο "${p.trip}".`
			}),
			trip_reminder: (p) => ({
				title: `Υπενθύμιση ταξιδιού: ${p.trip}`,
				body: `Το ταξίδι σας "${p.trip}" πλησιάζει!`
			}),
			todo_due: (p) => ({
				title: `Εκκρεμότητα προς εκτέλεση: ${p.todo}`,
				body: `Η εκκρεμότητα "${p.todo}" στο "${p.trip}" λήγει στις ${p.due}.`
			}),
			vacay_invite: (p) => ({
				title: "Πρόσκληση συγχώνευσης διακοπών",
				body: `Ο/Η ${p.actor} σας προσκάλεσε να συγχωνεύσετε τα σχέδια διακοπών σας. Ανοίξτε το memove για να αποδεχτείτε ή να απορρίψετε.`
			}),
			photos_shared: (p) => ({
				title: `${p.count} φωτογραφίες κοινοποιήθηκαν`,
				body: `Ο/Η ${p.actor} κοινοποίησε ${p.count} φωτογραφία/ες στο "${p.trip}".`
			}),
			collab_message: (p) => ({
				title: `Νέο μήνυμα στο "${p.trip}"`,
				body: `${p.actor}: ${p.preview}`
			}),
			packing_tagged: (p) => ({
				title: `Λίστα συσκευασίας: ${p.category}`,
				body: `Ο/Η ${p.actor} σας ανέθεσε στην κατηγορία "${p.category}" της λίστας συσκευασίας στο "${p.trip}".`
			}),
			version_available: (p) => ({
				title: "Νέα έκδοση memove διαθέσιμη",
				body: `Η έκδοση memove ${p.version} είναι τώρα διαθέσιμη. Επισκεφθείτε τον πίνακα διαχείρισης για να ενημερώσετε.`
			}),
			synology_session_cleared: () => ({
				title: "Η σύνδεση Synology τερματίστηκε",
				body: "Ο λογαριασμός σας Synology ή το URL άλλαξε. Έχετε αποσυνδεθεί από το Synology Photos."
			})
		},
		passwordReset: {
			subject: "Επαναφορά κωδικού πρόσβασης",
			greeting: "Γεια σας",
			body: "Λάβαμε ένα αίτημα επαναφοράς του κωδικού πρόσβασης για τον λογαριασμό σας στο memove. Κάντε κλικ στο παρακάτω κουμπί για να ορίσετε νέο κωδικό πρόσβασης.",
			ctaIntro: "Επαναφορά κωδικού",
			expiry: "Αυτός ο σύνδεσμος λήγει σε 60 λεπτά.",
			ignore: "Εάν δεν ζητήσατε αυτή την αλλαγή, μπορείτε να αγνοήσετε αυτό το μήνυμα — ο κωδικός σας δεν θα αλλάξει."
		}
	}
};
const EMAIL_I18N = Object.fromEntries(Object.entries(LOCALES).map(([k, v]) => [k, v.email]));
const EVENT_TEXTS = Object.fromEntries(Object.entries(LOCALES).map(([k, v]) => [k, v.events]));
const PASSWORD_RESET_I18N = Object.fromEntries(Object.entries(LOCALES).map(([k, v]) => [k, v.passwordReset]));
//#endregion
exports.EMAIL_I18N = EMAIL_I18N;
exports.EVENT_TEXTS = EVENT_TEXTS;
exports.PASSWORD_RESET_I18N = PASSWORD_RESET_I18N;
